// tests/smoke_conduit_pipeline.ts
//
// W2 smoke test: prove the injection -> capture pipeline works end-to-end on
// ONE app (Conduit). Picks one defect per category from injection-points.yaml,
// captures one baseline and one defect screenshot per category, writes 12 PNGs
// to data/images/conduit/.
//
// Pre-requisites (NOT performed by this script):
//   docker compose -f apps/conduit/docker-compose.yml up --build -d
//   ./apps/conduit/seed.sh
//
// Run:
//   npx tsx tests/smoke_conduit_pipeline.ts
//
// Exits non-zero with a structured error on first failure; environmental
// failures (Conduit unreachable, selector not found) are reported with
// remediation hints, not silently swallowed.

import { chromium } from 'playwright';
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
const INJECTION_POINTS = resolve(REPO_ROOT, 'apps/conduit/injection-points.yaml');
const OUT_DIR = resolve(REPO_ROOT, 'data/images/conduit');
const FRONTEND_BASE = process.env.CONDUIT_FRONTEND_URL ?? 'http://localhost:4100';

const SURFACE_PATH: Record<string, string> = {
  home: '/',
  article: '/article/visual-oracle-bench-overview',
  profile: '/profile/alice',
  editor: '/editor',
  settings: '/settings',
};

const VIEWPORT = { width: 1440, height: 900 };

// Surfaces requiring login: editor + settings. We log in via the API to grab a
// JWT, then inject it into localStorage under the key the Angular client reads.
async function tryLogin(): Promise<string | null> {
  try {
    const r = await fetch('http://localhost:3000/api/users/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user: { email: 'alice@voracle.test', password: 'voracle-seed-Pa55word!' },
      }),
    });
    if (!r.ok) return null;
    const data = (await r.json()) as { user?: { token?: string } };
    return data.user?.token ?? null;
  } catch {
    return null;
  }
}

interface PointSpec {
  id: string;
  surface: keyof typeof SURFACE_PATH;
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
  const raw = readFileSync(INJECTION_POINTS, 'utf8');
  return parseYaml(raw) as InjectionFile;
}

function pickOnePerCategory(file: InjectionFile): Record<DefectCategory, PointSpec> {
  const out: Partial<Record<DefectCategory, PointSpec>> = {};
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

async function checkFrontendUp(): Promise<void> {
  try {
    const r = await fetch(FRONTEND_BASE);
    if (!r.ok) {
      throw new Error(`Conduit frontend at ${FRONTEND_BASE} returned ${r.status}`);
    }
  } catch (e) {
    throw new Error(
      `Conduit frontend not reachable at ${FRONTEND_BASE}: ${(e as Error).message}\n` +
        `  -> Run: docker compose -f apps/conduit/docker-compose.yml up --build -d\n` +
        `  -> Then: ./apps/conduit/seed.sh`,
    );
  }
}

async function runOne(
  category: DefectCategory,
  spec: PointSpec,
  authToken: string | null,
): Promise<{ baseline: string; defect: string; record: DefectRecord }> {
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    // Inject JWT before any navigation so guarded routes load.
    if (authToken) {
      await ctx.addInitScript((token) => {
        try {
          localStorage.setItem('jwtToken', token);
          localStorage.setItem('token', token);
        } catch {
          /* ignore */
        }
      }, authToken);
    }

    const surfaceUrl = FRONTEND_BASE + SURFACE_PATH[spec.surface];

    // ---- BASELINE ----
    const basePage = await ctx.newPage();
    await basePage.goto(surfaceUrl, { waitUntil: 'networkidle', timeout: 30_000 });
    await basePage.waitForTimeout(400); // Angular hydration settle
    const baselinePath = resolve(OUT_DIR, `${spec.id}_baseline.png`);
    await basePage.screenshot({ path: baselinePath, type: 'png', fullPage: false });
    await basePage.close();

    // ---- DEFECT ----
    const defectPage = await ctx.newPage();
    await defectPage.goto(surfaceUrl, { waitUntil: 'networkidle', timeout: 30_000 });
    await defectPage.waitForTimeout(400);

    let record: DefectRecord;
    switch (spec.primitive) {
      case 'shift_element': {
        const p = spec.params ?? {};
        record = await PRIMITIVES.layout(defectPage, spec.selector, p.dx as number, p.dy as number, {
          app: 'conduit',
          defect_id: spec.id,
        });
        break;
      }
      case 'mutate_color': {
        const p = spec.params ?? {};
        record = await PRIMITIVES.color(
          defectPage,
          spec.selector,
          (p.prop as 'color' | 'backgroundColor' | 'borderColor') ?? 'color',
          (p.delta_hue as number) ?? 30,
          { app: 'conduit', defect_id: spec.id },
        );
        break;
      }
      case 'remove_element': {
        record = await PRIMITIVES.missing(defectPage, spec.selector, {
          app: 'conduit',
          defect_id: spec.id,
        });
        break;
      }
      case 'shrink_container': {
        const p = spec.params ?? {};
        record = await PRIMITIVES.truncation(
          defectPage,
          spec.selector,
          (p.width_pct as number) ?? 0.6,
          { app: 'conduit', defect_id: spec.id },
        );
        break;
      }
      case 'swap_zindex': {
        if (!spec.selector_b) throw new Error(`${spec.id}: swap_zindex needs selector_b`);
        record = await PRIMITIVES.zorder(defectPage, spec.selector, spec.selector_b, {
          app: 'conduit',
          defect_id: spec.id,
        });
        break;
      }
      case 'reduce_contrast': {
        const p = spec.params ?? {};
        record = await PRIMITIVES.contrast(
          defectPage,
          spec.selector,
          (p.target_ratio as number) ?? 3.0,
          { app: 'conduit', defect_id: spec.id },
        );
        break;
      }
      default:
        throw new Error(`${spec.id}: unknown primitive ${spec.primitive}`);
    }
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

  console.log('[smoke] verifying Conduit frontend is up ...');
  await checkFrontendUp();

  console.log('[smoke] attempting login (for /editor and /settings) ...');
  const token = await tryLogin();
  if (!token) {
    console.warn(
      '[smoke] WARN: could not log in -- editor and settings shots may redirect to /login',
    );
  } else {
    console.log('[smoke]   login ok');
  }

  mkdirSync(OUT_DIR, { recursive: true });

  const results: Array<{ category: DefectCategory; baseline: string; defect: string; record: DefectRecord }> = [];
  for (const cat of ['layout', 'color', 'missing', 'truncation', 'zorder', 'contrast'] as DefectCategory[]) {
    const spec = picks[cat];
    console.log(`[smoke] running ${cat} via ${spec.primitive} on ${spec.surface} ${spec.selector}`);
    try {
      const r = await runOne(cat, spec, token);
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
