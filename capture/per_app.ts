// capture/per_app.ts
//
// Shared scaffolding for the W6 corpus-capture orchestrator
// (scripts/capture_corpus.ts). One driver per app lives under
// capture/drivers/<app>.ts. The capture loop here owns:
//
//   - Loading injection-points.yaml and validating shape.
//   - Iterating ALL N points per app (50/app, 400 total).
//   - Bounded-concurrency parallel capture WITHIN an app.
//   - Per-app browser context lifecycle (one Browser per app, one Context
//     per parallel worker; per-surface auth handled by the driver).
//   - Calling the correct injection/primitives.ts primitive given the
//     point's `primitive` string + `params`.
//   - Writing baseline + defect PNGs and the per-app capture ledger.
//
// The per-app driver supplies:
//   - app slug + injection-points path + output dir
//   - healthcheck (verify the docker-compose stack is up)
//   - per-context bootstrap (login, cookies, init scripts)
//   - per-page navigation (resolve surface -> URL, drive any interactive
//     pre-injection state such as opening a modal or panel)
//   - optional pre-capture hook (e.g. inject canvas overlays for
//     excalidraw/penpot)
//
// IMPORTANT: this file does NOT touch any apps/<name>/* artifact, does
// NOT modify tests/smoke_*_pipeline.ts, and does NOT change
// injection/primitives.ts. It re-uses the same primitives and the same
// yaml schema the smoke tests already consume.

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';

import { PRIMITIVES, DefectCategory, DefectRecord } from '../injection/primitives.js';

export const VIEWPORT = { width: 1440, height: 900 };

export interface PointSpec {
  id: string;
  surface: string;
  category: DefectCategory;
  primitive: string;
  selector: string;
  selector_b?: string;
  params?: Record<string, unknown>;
  expected_change: string;
}

export interface InjectionFile {
  version: number;
  app: string;
  points: PointSpec[];
}

export interface CaptureResult {
  defect_id: string;
  category: DefectCategory;
  surface: string;
  baseline: string;
  defect: string;
  record: DefectRecord | null;
  ok: boolean;
  error?: string;
  duration_ms: number;
}

export interface CaptureLedger {
  app: string;
  captured_at: string;
  viewport: { width: number; height: number };
  base_url: string;
  total_points: number;
  ok_count: number;
  fail_count: number;
  results: CaptureResult[];
}

/**
 * What a per-app driver must implement. The capture loop owns the browser
 * + context + screenshot lifecycle; the driver owns *only* the parts
 * that vary across apps: how to log in, how to translate a surface name
 * to a URL, and any interactive pre-capture setup.
 */
export interface PerAppDriver {
  /** App slug (matches the apps/<slug>/ directory and the YAML "app:" field). */
  readonly app: string;
  /** Path to apps/<app>/injection-points.yaml. */
  readonly injectionPointsPath: string;
  /** Path to data/images/<app>/ (created by the loop if absent). */
  readonly outDir: string;
  /** Base URL for the app, after the docker-compose stack is up. */
  readonly baseUrl: string;

  /** Verify the docker-compose stack is up + seeded. Throw on failure. */
  healthcheck(): Promise<void>;

  /**
   * One-shot pre-capture work (e.g. log in via API, resolve seeded fixture
   * IDs from the app's REST surface). Returns an opaque "session" object
   * the per-context bootstrap and per-surface navigation hooks then receive.
   */
  bootstrap(): Promise<AppSession>;

  /**
   * Per-context setup. Called once per Playwright BrowserContext (so once
   * per parallel worker). Use this to seed cookies / localStorage / init
   * scripts so subsequent page navigations are authenticated.
   *
   * If a surface should be UNauthenticated (e.g. /login screen), the
   * driver should leave the context as-is and check `spec.surface` inside
   * `navigate()`.
   */
  authenticate(ctx: BrowserContext, session: AppSession, spec: PointSpec): Promise<void>;

  /**
   * Per-page navigation: drive `page` to the right URL and complete any
   * interactive setup (open a modal, click into a panel). Returns when
   * the page is settled and ready for screenshot + injection.
   */
  navigate(page: Page, spec: PointSpec, session: AppSession): Promise<void>;
}

/**
 * Opaque per-session blob returned by `bootstrap()` and threaded through
 * the rest of the per-app calls. Drivers may store auth tokens, resolved
 * fixture IDs, etc.
 */
export type AppSession = Record<string, unknown>;

/** Read + validate apps/<app>/injection-points.yaml. */
export function loadInjectionPoints(path: string, expectedApp: string): InjectionFile {
  if (!existsSync(path)) {
    throw new Error(`injection-points.yaml not found at ${path}`);
  }
  const raw = readFileSync(path, 'utf8');
  const file = parseYaml(raw) as InjectionFile;
  if (file.app !== expectedApp) {
    throw new Error(`injection-points.yaml app="${file.app}" but driver expected "${expectedApp}"`);
  }
  if (!Array.isArray(file.points) || file.points.length === 0) {
    throw new Error(`${path}: no points`);
  }
  return file;
}

/** Apply the right primitive to a page given a point spec. */
export async function applyPrimitive(page: Page, spec: PointSpec, app: string): Promise<DefectRecord> {
  const opts = { app, defect_id: spec.id };
  switch (spec.primitive) {
    case 'shift_element': {
      const p = spec.params ?? {};
      return PRIMITIVES.layout(page, spec.selector, p.dx as number, p.dy as number, opts);
    }
    case 'mutate_color': {
      const p = spec.params ?? {};
      return PRIMITIVES.color(
        page,
        spec.selector,
        (p.prop as 'color' | 'backgroundColor' | 'borderColor') ?? 'color',
        (p.delta_hue as number) ?? 30,
        opts,
      );
    }
    case 'remove_element':
      return PRIMITIVES.missing(page, spec.selector, opts);
    case 'shrink_container': {
      const p = spec.params ?? {};
      return PRIMITIVES.truncation(page, spec.selector, (p.width_pct as number) ?? 0.6, opts);
    }
    case 'swap_zindex': {
      if (!spec.selector_b) throw new Error(`${spec.id}: swap_zindex needs selector_b`);
      return PRIMITIVES.zorder(page, spec.selector, spec.selector_b, opts);
    }
    case 'reduce_contrast': {
      const p = spec.params ?? {};
      return PRIMITIVES.contrast(page, spec.selector, (p.target_ratio as number) ?? 3.0, opts);
    }
    default:
      throw new Error(`${spec.id}: unknown primitive ${spec.primitive}`);
  }
}

/**
 * Capture one (baseline, defect) pair for a single injection point. Each
 * call gets a fresh context so per-point auth requirements are respected.
 */
export async function captureOnePoint(
  browser: Browser,
  driver: PerAppDriver,
  session: AppSession,
  spec: PointSpec,
): Promise<CaptureResult> {
  const t0 = Date.now();
  const baselinePath = resolve(driver.outDir, 'baseline', `${spec.id}.png`);
  const defectPath = resolve(driver.outDir, 'defect', `${spec.id}.png`);
  let record: DefectRecord | null = null;
  let ok = false;
  let error: string | undefined;
  try {
    const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    try {
      await driver.authenticate(ctx, session, spec);

      // BASELINE
      const basePage = await ctx.newPage();
      await driver.navigate(basePage, spec, session);
      mkdirSync(resolve(driver.outDir, 'baseline'), { recursive: true });
      await basePage.screenshot({ path: baselinePath, type: 'png', fullPage: false });
      await basePage.close();

      // DEFECT
      const defectPage = await ctx.newPage();
      await driver.navigate(defectPage, spec, session);
      record = await applyPrimitive(defectPage, spec, driver.app);
      await defectPage.waitForTimeout(120); // layout flush
      mkdirSync(resolve(driver.outDir, 'defect'), { recursive: true });
      await defectPage.screenshot({ path: defectPath, type: 'png', fullPage: false });
      await defectPage.close();
      ok = true;
    } finally {
      await ctx.close();
    }
  } catch (e) {
    error = (e as Error).message;
  }
  return {
    defect_id: spec.id,
    category: spec.category,
    surface: spec.surface,
    baseline: baselinePath,
    defect: defectPath,
    record,
    ok,
    error,
    duration_ms: Date.now() - t0,
  };
}

/**
 * Drive a single app's full capture: 50 baseline + 50 defect PNGs, with
 * `concurrency` in-flight per app. Writes per-app ledger to
 * data/images/<app>/_capture_ledger.json.
 */
export async function captureApp(
  driver: PerAppDriver,
  opts: { concurrency: number; subset?: string[] } = { concurrency: 4 },
): Promise<CaptureLedger> {
  console.log(`[capture] === ${driver.app} ===`);
  console.log(`[capture] base_url=${driver.baseUrl}`);
  console.log(`[capture] healthcheck ...`);
  await driver.healthcheck();
  console.log(`[capture] bootstrap ...`);
  const session = await driver.bootstrap();

  const file = loadInjectionPoints(driver.injectionPointsPath, driver.app);
  let points = file.points;
  if (opts.subset && opts.subset.length > 0) {
    const subset = new Set(opts.subset);
    points = points.filter((p) => subset.has(p.id));
    if (points.length === 0) {
      throw new Error(`subset filter dropped all points for ${driver.app}`);
    }
  }
  console.log(`[capture] ${points.length} points (concurrency=${opts.concurrency})`);

  mkdirSync(driver.outDir, { recursive: true });
  mkdirSync(resolve(driver.outDir, 'baseline'), { recursive: true });
  mkdirSync(resolve(driver.outDir, 'defect'), { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const results: CaptureResult[] = [];
  let okCount = 0;
  let failCount = 0;
  try {
    // Bounded-concurrency: maintain at most N in-flight captures within this app.
    let next = 0;
    async function pump(): Promise<void> {
      while (true) {
        const idx = next++;
        if (idx >= points.length) return;
        const spec = points[idx];
        const r = await captureOnePoint(browser, driver, session, spec);
        results.push(r);
        if (r.ok) {
          okCount++;
          console.log(
            `[capture] ${driver.app} [${idx + 1}/${points.length}] ${r.defect_id} ok (${r.duration_ms}ms)`,
          );
        } else {
          failCount++;
          console.error(
            `[capture] ${driver.app} [${idx + 1}/${points.length}] ${r.defect_id} FAIL: ${r.error}`,
          );
        }
      }
    }
    const pumps = Array(Math.min(opts.concurrency, points.length))
      .fill(0)
      .map(() => pump());
    await Promise.all(pumps);
  } finally {
    await browser.close();
  }

  // Stable order: sort results by defect_id so the ledger is deterministic
  // even though capture itself ran out-of-order.
  results.sort((a, b) => a.defect_id.localeCompare(b.defect_id));

  const ledger: CaptureLedger = {
    app: driver.app,
    captured_at: new Date().toISOString(),
    viewport: VIEWPORT,
    base_url: driver.baseUrl,
    total_points: points.length,
    ok_count: okCount,
    fail_count: failCount,
    results,
  };
  const ledgerPath = resolve(driver.outDir, '_capture_ledger.json');
  writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));
  console.log(
    `[capture] ${driver.app} done: ${okCount}/${points.length} ok, ${failCount} fail -> ${ledgerPath}`,
  );
  return ledger;
}
