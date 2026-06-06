// tests/smoke_penpot_pipeline.ts
//
// W5 smoke test: prove the injection -> capture pipeline works end-to-end
// on Penpot. Picks one defect per category from
// apps/penpot/injection-points.yaml, captures one baseline and one defect
// screenshot per category, writes 12 PNGs to data/images/penpot/.
//
// Pre-requisites (NOT performed by this script):
//   docker compose -f apps/penpot/docker-compose.yml up --build -d
//   npx tsx apps/penpot/seed.ts
//
// Run:
//   npx tsx tests/smoke_penpot_pipeline.ts
//
// Methodological note (see apps/penpot/RUNBOOK.md "Known risks" #3):
//   20 of the 50 injection points target canvas-rendered SVG content via
//   positional DOM overlays (marked with params.canvas_compromise: true
//   in the YAML). This smoke test injects ALL such overlays into the
//   page BEFORE capturing the baseline, so baseline and defect are
//   compared on the same overlay-augmented DOM.

import { chromium, type Page, type BrowserContext } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

import {
  PRIMITIVES,
  DefectCategory,
  DefectRecord,
} from '../injection/primitives.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const REPO_ROOT = resolve(__dirname, '..');
const INJECTION_POINTS = resolve(REPO_ROOT, 'apps/penpot/injection-points.yaml');
const FIXTURE_META = resolve(REPO_ROOT, 'apps/penpot/fixtures/seed-fixture.json');
const OUT_DIR = resolve(REPO_ROOT, 'data/images/penpot');
const BASE_URL = process.env.PENPOT_URL ?? 'http://localhost:9001';
const API_BASE = `${BASE_URL}/api/rpc`;

const ADMIN_EMAIL = 'voracle-admin@voracle.test';
const ADMIN_PASSWORD = 'voracle-seed-Pa55word!';

const VIEWPORT = { width: 1440, height: 900 };

interface FixtureMeta {
  team: { id: string; name: string };
  project: { id: string; name: string };
  file: { id: string; name: string };
}

interface PointSpec {
  id: string;
  surface: 'login' | 'dashboard' | 'file-viewer' | 'workspace' | 'settings';
  category: DefectCategory;
  primitive: string;
  selector: string;
  selector_b?: string;
  params?: Record<string, unknown>;
  expected_change: string;
}

interface InjectionFile {
  version: number;
  app: string;
  points: PointSpec[];
}

function loadPoints(): InjectionFile {
  if (!existsSync(INJECTION_POINTS)) {
    throw new Error(`injection-points.yaml not found at ${INJECTION_POINTS}`);
  }
  return parseYaml(readFileSync(INJECTION_POINTS, 'utf8')) as InjectionFile;
}

function loadFixtureMeta(): FixtureMeta | null {
  if (!existsSync(FIXTURE_META)) return null;
  return JSON.parse(readFileSync(FIXTURE_META, 'utf8')) as FixtureMeta;
}

function pickOnePerCategory(file: InjectionFile): Record<DefectCategory, PointSpec> {
  const out: Partial<Record<DefectCategory, PointSpec>> = {};
  // Prefer non-canvas-compromise points for the smoke pipeline so we
  // exercise the canonical DOM path; fall back to canvas-overlay points
  // only when no chrome point exists for a category.
  for (const p of file.points) {
    if (out[p.category]) continue;
    const isCompromise = (p.params as Record<string, unknown> | undefined)?.canvas_compromise === true;
    if (!isCompromise) out[p.category] = p;
  }
  for (const p of file.points) {
    if (!out[p.category]) out[p.category] = p;
  }
  const missing: DefectCategory[] = [];
  for (const c of ['layout', 'color', 'missing', 'truncation', 'zorder', 'contrast'] as DefectCategory[]) {
    if (!out[c]) missing.push(c);
  }
  if (missing.length > 0) {
    throw new Error(`injection-points.yaml missing categories: ${missing.join(',')}`);
  }
  return out as Record<DefectCategory, PointSpec>;
}

async function checkUp(): Promise<void> {
  try {
    const r = await fetch(`${API_BASE}/command/get-profile`, { method: 'POST', body: '{}' });
    // 200 or 401/403 (no session) both indicate the JVM is serving.
    if (r.status >= 500) {
      throw new Error(`Penpot backend at ${API_BASE} returned ${r.status}`);
    }
  } catch (e) {
    throw new Error(
      `Penpot not reachable at ${BASE_URL}: ${(e as Error).message}\n` +
        `  -> Run: docker compose -f apps/penpot/docker-compose.yml up --build -d\n` +
        `  -> Then: npx tsx apps/penpot/seed.ts`,
    );
  }
}

// Login via the RPC command and capture the auth-token cookie so we can
// replay it into the browser context (Penpot uses session cookies, not
// Bearer tokens).
async function apiLoginAndGetCookie(): Promise<string | null> {
  try {
    const r = await fetch(`${API_BASE}/command/login-with-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    });
    if (!r.ok) return null;
    if (typeof r.headers.getSetCookie === 'function') {
      for (const c of r.headers.getSetCookie() as string[]) {
        const m = c.match(/auth-token=([^;]+)/);
        if (m) return m[1];
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function seedAuthCookie(ctx: BrowserContext, authToken: string): Promise<void> {
  const url = new URL(BASE_URL);
  await ctx.addCookies([
    {
      name: 'auth-token',
      value: authToken,
      domain: url.hostname,
      path: '/',
      httpOnly: true,
      secure: url.protocol === 'https:',
      sameSite: 'Lax',
    },
  ]);
}

// Inject the canvas-overlay DOM. These overlays simulate canvas-rendered
// SVG content (rectangles, ellipses, text, lines) as positional divs
// aligned to the .viewport area, so DOM-based injection primitives can
// target them via the `.canvas-fixture-*` selectors used in the YAML.
async function injectCanvasOverlays(page: Page): Promise<void> {
  await page.evaluate(() => {
    const root = (document.querySelector('.viewport') ??
      document.querySelector('.workspace-content') ??
      document.querySelector('.render-shapes') ??
      document.body) as HTMLElement | null;
    if (!root) return;
    if (root.querySelector('[data-voracle-overlay-root="1"]')) return;
    const container = document.createElement('div');
    container.setAttribute('data-voracle-overlay-root', '1');
    Object.assign(container.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      zIndex: '1',
    });
    // Overlays mirror the 8 fixture shapes seeded in apps/penpot/seed.ts.
    const overlays: Array<{
      cls: string;
      x: number;
      y: number;
      w: number;
      h: number;
      text?: string;
      bg: string;
      color: string;
    }> = [
      { cls: 'canvas-fixture-rect-1-overlay', x: 200, y: 180, w: 160, h: 100, bg: 'rgba(30,30,30,0.5)', color: '#1e1e1e' },
      { cls: 'canvas-fixture-rect-2-overlay', x: 420, y: 180, w: 200, h: 120, bg: 'rgba(165,216,255,0.6)', color: '#1e1e1e' },
      { cls: 'canvas-fixture-ellipse-1-overlay', x: 200, y: 340, w: 120, h: 120, bg: 'rgba(178,242,187,0.5)', color: '#1e1e1e' },
      { cls: 'canvas-fixture-ellipse-2-overlay', x: 380, y: 340, w: 180, h: 100, bg: 'rgba(255,236,153,0.6)', color: '#1e1e1e' },
      { cls: 'canvas-fixture-text-1-overlay', x: 200, y: 500, w: 380, h: 28, bg: 'transparent', color: '#1e1e1e', text: 'Visual Oracle Bench Fixture' },
      { cls: 'canvas-fixture-text-2-overlay', x: 200, y: 560, w: 280, h: 24, bg: 'transparent', color: '#1e1e1e', text: 'voracle-bench seed canvas' },
      { cls: 'canvas-fixture-line-1-overlay', x: 200, y: 620, w: 400, h: 2, bg: 'rgba(30,30,30,0.8)', color: '#1e1e1e' },
      { cls: 'canvas-fixture-arrow-1-overlay', x: 250, y: 660, w: 300, h: 6, bg: 'rgba(30,30,30,0.8)', color: '#1e1e1e' },
    ];
    for (const o of overlays) {
      const el = document.createElement('div');
      el.className = o.cls;
      Object.assign(el.style, {
        position: 'absolute',
        left: `${o.x}px`,
        top: `${o.y}px`,
        width: `${o.w}px`,
        height: `${o.h}px`,
        background: o.bg,
        color: o.color,
        font: '14px sans-serif',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
      } as Partial<CSSStyleDeclaration>);
      if (o.text) el.textContent = o.text;
      container.appendChild(el);
    }
    root.appendChild(container);
  });
}

function surfacePath(surface: PointSpec['surface'], meta: FixtureMeta | null): string {
  if (!meta && surface !== 'login') {
    // Fall back to the dashboard root so the navigation does not 404; the
    // smoke test will still capture *something* but the canvas overlays
    // are what carry the defect signal in that case.
    return '/#/dashboard/projects';
  }
  switch (surface) {
    case 'login':
      return '/#/auth/login';
    case 'dashboard':
      return `/#/dashboard/projects?team-id=${meta!.team.id}`;
    case 'file-viewer':
      return `/#/view/${meta!.file.id}?index=0`;
    case 'workspace':
      return `/#/workspace/${meta!.team.id}/${meta!.project.id}/${meta!.file.id}`;
    case 'settings':
      return '/#/settings/profile';
  }
}

async function navigateSurface(
  page: Page,
  spec: PointSpec,
  meta: FixtureMeta | null,
): Promise<void> {
  const url = BASE_URL + surfacePath(spec.surface, meta);
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
  // ClojureScript app + canvas first-paint settle.
  await page.waitForTimeout(1_000);
  // Always inject overlays so canvas-compromise selectors resolve.
  await injectCanvasOverlays(page);
}

async function applyPrimitive(page: Page, spec: PointSpec): Promise<DefectRecord> {
  switch (spec.primitive) {
    case 'shift_element': {
      const p = spec.params ?? {};
      return PRIMITIVES.layout(page, spec.selector, p.dx as number, p.dy as number, {
        app: 'penpot',
        defect_id: spec.id,
      });
    }
    case 'mutate_color': {
      const p = spec.params ?? {};
      return PRIMITIVES.color(
        page,
        spec.selector,
        (p.prop as 'color' | 'backgroundColor' | 'borderColor') ?? 'color',
        (p.delta_hue as number) ?? 30,
        { app: 'penpot', defect_id: spec.id },
      );
    }
    case 'remove_element':
      return PRIMITIVES.missing(page, spec.selector, {
        app: 'penpot',
        defect_id: spec.id,
      });
    case 'shrink_container': {
      const p = spec.params ?? {};
      return PRIMITIVES.truncation(
        page,
        spec.selector,
        (p.width_pct as number) ?? 0.6,
        { app: 'penpot', defect_id: spec.id },
      );
    }
    case 'swap_zindex': {
      if (!spec.selector_b) throw new Error(`${spec.id}: swap_zindex needs selector_b`);
      return PRIMITIVES.zorder(page, spec.selector, spec.selector_b, {
        app: 'penpot',
        defect_id: spec.id,
      });
    }
    case 'reduce_contrast': {
      const p = spec.params ?? {};
      return PRIMITIVES.contrast(
        page,
        spec.selector,
        (p.target_ratio as number) ?? 3.0,
        { app: 'penpot', defect_id: spec.id },
      );
    }
    default:
      throw new Error(`${spec.id}: unknown primitive ${spec.primitive}`);
  }
}

async function runOne(
  category: DefectCategory,
  spec: PointSpec,
  meta: FixtureMeta | null,
  authToken: string | null,
): Promise<{ baseline: string; defect: string; record: DefectRecord }> {
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    if (authToken && spec.surface !== 'login') {
      await seedAuthCookie(ctx, authToken);
    }

    // ---- BASELINE ----
    const basePage = await ctx.newPage();
    await navigateSurface(basePage, spec, meta);
    const baselinePath = resolve(OUT_DIR, `${spec.id}_baseline.png`);
    await basePage.screenshot({ path: baselinePath, type: 'png', fullPage: false });
    await basePage.close();

    // ---- DEFECT ----
    const defectPage = await ctx.newPage();
    await navigateSurface(defectPage, spec, meta);
    const record = await applyPrimitive(defectPage, spec);
    await defectPage.waitForTimeout(120); // layout flush
    const defectPath = resolve(OUT_DIR, `${spec.id}_defect.png`);
    await defectPage.screenshot({ path: defectPath, type: 'png', fullPage: false });
    await defectPage.close();

    await ctx.close();
    return { baseline: baselinePath, defect: defectPath, record };
  } finally {
    await browser.close();
  }
}

async function main(): Promise<void> {
  console.log('[smoke] loading injection points ...');
  const file = loadPoints();
  const picks = pickOnePerCategory(file);

  console.log('[smoke] verifying Penpot is up ...');
  await checkUp();

  console.log('[smoke] reading fixture metadata ...');
  const meta = loadFixtureMeta();
  if (!meta) {
    console.warn(
      '[smoke] WARN: apps/penpot/fixtures/seed-fixture.json not found; ' +
        'team/project/file URLs will fall back to /#/dashboard. ' +
        'Run `npx tsx apps/penpot/seed.ts` for full coverage.',
    );
  } else {
    console.log(`[smoke]   team=${meta.team.id} project=${meta.project.id} file=${meta.file.id}`);
  }

  console.log('[smoke] logging in as admin (cookie auth) ...');
  const authToken = await apiLoginAndGetCookie();
  if (!authToken) {
    console.warn(
      '[smoke] WARN: admin login failed -- did you run `npx tsx apps/penpot/seed.ts`? ' +
        'Dashboard/workspace/settings shots will redirect to /#/auth/login.',
    );
  } else {
    console.log('[smoke]   admin ok');
  }

  mkdirSync(OUT_DIR, { recursive: true });

  const results: Array<{ category: DefectCategory; baseline: string; defect: string; record: DefectRecord }> = [];
  for (const cat of ['layout', 'color', 'missing', 'truncation', 'zorder', 'contrast'] as DefectCategory[]) {
    const spec = picks[cat];
    console.log(`[smoke] running ${cat} via ${spec.primitive} on ${spec.surface} ${spec.selector}`);
    try {
      const r = await runOne(cat, spec, meta, authToken);
      results.push({ category: cat, ...r });
      console.log(`[smoke]   ok: ${r.baseline.split('/').pop()} + ${r.defect.split('/').pop()}`);
    } catch (e) {
      console.error(`[smoke]   FAIL ${spec.id}: ${(e as Error).message}`);
      throw e;
    }
  }

  const ledgerPath = resolve(OUT_DIR, '_smoke_ledger.json');
  writeFileSync(
    ledgerPath,
    JSON.stringify(
      {
        captured_at: new Date().toISOString(),
        viewport: VIEWPORT,
        results: results.map((r) => ({
          category: r.category,
          baseline: r.baseline,
          defect: r.defect,
          record: r.record,
        })),
      },
      null,
      2,
    ),
  );

  console.log(`[smoke] done. 12 PNGs + ledger -> ${OUT_DIR}`);
}

main().catch((e) => {
  console.error('[smoke] aborted:', e);
  process.exit(1);
});
