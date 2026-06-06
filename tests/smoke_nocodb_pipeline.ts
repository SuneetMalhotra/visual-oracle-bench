// tests/smoke_nocodb_pipeline.ts
//
// W5 smoke test: prove the injection -> capture pipeline works end-to-end
// on NocoDB. Picks one defect per category from
// apps/nocodb/injection-points.yaml, captures one baseline and one defect
// screenshot per category, writes 12 PNGs to data/images/nocodb/.
//
// Pre-requisites (NOT performed by this script):
//   docker compose -f apps/nocodb/docker-compose.yml up --build -d
//   ./apps/nocodb/seed.sh
//
// Run:
//   npx tsx tests/smoke_nocodb_pipeline.ts
//
// Reactive-rendering note (see apps/nocodb/RUNBOOK.md "Known risks" #3):
//   The grid view has reactive rendering that can shift on data updates.
//   The smoke pipeline waits for `.nc-grid-row[data-row-index='0']` to
//   have a stable bounding box for 2 consecutive frames before screenshot.

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
const INJECTION_POINTS = resolve(REPO_ROOT, 'apps/nocodb/injection-points.yaml');
const JWT_FILE = resolve(REPO_ROOT, 'apps/nocodb/.admin-jwt');
const OUT_DIR = resolve(REPO_ROOT, 'data/images/nocodb');
const BASE_URL = process.env.NC_BASE_URL ?? 'http://localhost:8080';
const API_V1 = `${BASE_URL}/api/v1`;
const API_V2 = `${BASE_URL}/api/v2`;

const ADMIN_EMAIL = 'admin@voracle.test';
const ADMIN_PASSWORD = 'voracle-seed-Pa55word!';
const BASE_NAME = 'voracle-fixture';
const TABLE_AUTHORS = 'Authors';
const TABLE_ARTICLES = 'Articles';

const VIEWPORT = { width: 1440, height: 900 };

interface PointSpec {
  id: string;
  surface: 'login' | 'base-list' | 'table-grid' | 'table-form' | 'settings-drawer';
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

interface FixtureRefs {
  baseId: string;
  articlesTableId: string;
  articlesGridViewId: string;
  articlesFormViewId: string;
}

function loadPoints(): InjectionFile {
  if (!existsSync(INJECTION_POINTS)) {
    throw new Error(`injection-points.yaml not found at ${INJECTION_POINTS}`);
  }
  return parseYaml(readFileSync(INJECTION_POINTS, 'utf8')) as InjectionFile;
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

async function checkUp(): Promise<void> {
  try {
    const r = await fetch(`${API_V1}/health`);
    if (!r.ok) {
      throw new Error(`NocoDB at ${BASE_URL} returned ${r.status}`);
    }
  } catch (e) {
    throw new Error(
      `NocoDB not reachable at ${BASE_URL}: ${(e as Error).message}\n` +
        `  -> Run: docker compose -f apps/nocodb/docker-compose.yml up --build -d\n` +
        `  -> Then: ./apps/nocodb/seed.sh`,
    );
  }
}

function loadCachedJwt(): string | null {
  if (!existsSync(JWT_FILE)) return null;
  const v = readFileSync(JWT_FILE, 'utf8').trim();
  return v.length > 0 ? v : null;
}

async function apiSignin(): Promise<string | null> {
  try {
    const r = await fetch(`${API_V1}/auth/user/signin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { token?: string };
    return j.token ?? null;
  } catch {
    return null;
  }
}

async function resolveFixtureRefs(jwt: string): Promise<FixtureRefs | null> {
  async function getJson<T>(url: string): Promise<T | null> {
    try {
      const r = await fetch(url, { headers: { 'xc-auth': jwt, 'xc-token': jwt } });
      if (!r.ok) return null;
      return (await r.json()) as T;
    } catch {
      return null;
    }
  }
  const bases = await getJson<{ list: Array<{ id: string; title: string }> }>(`${API_V2}/meta/bases`);
  if (!bases) return null;
  const base = bases.list.find((b) => b.title === BASE_NAME);
  if (!base) return null;
  const tables = await getJson<{ list: Array<{ id: string; title: string; table_name: string }> }>(
    `${API_V2}/meta/bases/${base.id}/tables`,
  );
  if (!tables) return null;
  const articles = tables.list.find((t) => t.title === TABLE_ARTICLES || t.table_name === TABLE_ARTICLES);
  if (!articles) return null;
  const views = await getJson<{ list: Array<{ id: string; title: string; type: number }> }>(
    `${API_V2}/meta/tables/${articles.id}/views`,
  );
  // type 3 = grid, type 2 = form (NocoDB ViewTypes enum). Fall back to any.
  const grid = views?.list.find((v) => v.type === 3) ?? views?.list[0];
  const form = views?.list.find((v) => v.type === 2) ?? grid;
  if (!grid || !form) return null;
  return {
    baseId: base.id,
    articlesTableId: articles.id,
    articlesGridViewId: grid.id,
    articlesFormViewId: form.id,
  };
}

async function seedAuthCookie(ctx: BrowserContext, jwt: string): Promise<void> {
  const url = new URL(BASE_URL);
  await ctx.addCookies([
    {
      name: 'xc-auth',
      value: jwt,
      domain: url.hostname,
      path: '/',
      httpOnly: false,
      secure: url.protocol === 'https:',
      sameSite: 'Lax',
    },
    {
      name: 'xc-token',
      value: jwt,
      domain: url.hostname,
      path: '/',
      httpOnly: false,
      secure: url.protocol === 'https:',
      sameSite: 'Lax',
    },
  ]);
  // Vue3 webapp also reads the token from localStorage on bootstrap in
  // some builds; inject it before the SPA loads.
  await ctx.addInitScript((token) => {
    try {
      localStorage.setItem('nc-token', token);
      localStorage.setItem('xc-auth', token);
    } catch {
      /* ignore */
    }
  }, jwt);
}

function surfacePath(surface: PointSpec['surface'], refs: FixtureRefs | null): string {
  if (surface === 'login') return '/#/signin';
  if (!refs) {
    // Fallback to dashboard root for table-grid/form when refs unavailable.
    if (surface === 'settings-drawer') return '/#/account/profile';
    return '/#/';
  }
  switch (surface) {
    case 'base-list':
      return '/#/';
    case 'table-grid':
      return `/#/nc/${refs.baseId}/table/${refs.articlesTableId}`;
    case 'table-form':
      return `/#/nc/${refs.baseId}/form/${refs.articlesFormViewId}`;
    case 'settings-drawer':
      return '/#/account/profile';
  }
}

// Wait until `.nc-grid-row[data-row-index='0']` has the same bounding
// box for 2 consecutive RAF ticks. Used to absorb the Vue 3 reactive
// re-render drift documented in RUNBOOK.md #3.
async function waitForGridStable(page: Page): Promise<void> {
  try {
    await page.waitForSelector('.nc-grid-row, [data-row-index="0"]', { timeout: 8_000 });
    await page.waitForFunction(
      () => {
        const el = document.querySelector('.nc-grid-row, [data-row-index="0"]');
        if (!el) return false;
        const rect = (el as HTMLElement).getBoundingClientRect();
        const w = (window as unknown as { __voracle_last_rect?: DOMRect }).__voracle_last_rect;
        (window as unknown as { __voracle_last_rect?: DOMRect }).__voracle_last_rect = rect;
        if (!w) return false;
        return Math.abs(w.x - rect.x) < 0.5 && Math.abs(w.y - rect.y) < 0.5 && Math.abs(w.width - rect.width) < 0.5;
      },
      { timeout: 8_000, polling: 'raf' },
    );
  } catch {
    // Best-effort; fall through to the unconditional waitForTimeout.
  }
}

async function navigateSurface(page: Page, spec: PointSpec, refs: FixtureRefs | null): Promise<void> {
  const url = BASE_URL + surfacePath(spec.surface, refs);
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
  // Vue 3 hydration settle + initial data fetch.
  await page.waitForTimeout(800);
  if (spec.surface === 'table-grid') {
    await waitForGridStable(page);
    await page.waitForTimeout(200);
  }
}

async function applyPrimitive(page: Page, spec: PointSpec): Promise<DefectRecord> {
  switch (spec.primitive) {
    case 'shift_element': {
      const p = spec.params ?? {};
      return PRIMITIVES.layout(page, spec.selector, p.dx as number, p.dy as number, {
        app: 'nocodb', defect_id: spec.id,
      });
    }
    case 'mutate_color': {
      const p = spec.params ?? {};
      return PRIMITIVES.color(
        page,
        spec.selector,
        (p.prop as 'color' | 'backgroundColor' | 'borderColor') ?? 'color',
        (p.delta_hue as number) ?? 30,
        { app: 'nocodb', defect_id: spec.id },
      );
    }
    case 'remove_element':
      return PRIMITIVES.missing(page, spec.selector, { app: 'nocodb', defect_id: spec.id });
    case 'shrink_container': {
      const p = spec.params ?? {};
      return PRIMITIVES.truncation(
        page,
        spec.selector,
        (p.width_pct as number) ?? 0.6,
        { app: 'nocodb', defect_id: spec.id },
      );
    }
    case 'swap_zindex': {
      if (!spec.selector_b) throw new Error(`${spec.id}: swap_zindex needs selector_b`);
      return PRIMITIVES.zorder(page, spec.selector, spec.selector_b, {
        app: 'nocodb', defect_id: spec.id,
      });
    }
    case 'reduce_contrast': {
      const p = spec.params ?? {};
      return PRIMITIVES.contrast(
        page,
        spec.selector,
        (p.target_ratio as number) ?? 3.0,
        { app: 'nocodb', defect_id: spec.id },
      );
    }
    default:
      throw new Error(`${spec.id}: unknown primitive ${spec.primitive}`);
  }
}

async function runOne(
  category: DefectCategory,
  spec: PointSpec,
  refs: FixtureRefs | null,
  jwt: string | null,
): Promise<{ baseline: string; defect: string; record: DefectRecord }> {
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    if (jwt && spec.surface !== 'login') {
      await seedAuthCookie(ctx, jwt);
    }

    // ---- BASELINE ----
    const basePage = await ctx.newPage();
    await navigateSurface(basePage, spec, refs);
    const baselinePath = resolve(OUT_DIR, `${spec.id}_baseline.png`);
    await basePage.screenshot({ path: baselinePath, type: 'png', fullPage: false });
    await basePage.close();

    // ---- DEFECT ----
    const defectPage = await ctx.newPage();
    await navigateSurface(defectPage, spec, refs);
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

  console.log('[smoke] verifying NocoDB is up ...');
  await checkUp();

  console.log('[smoke] resolving admin JWT (cached or fresh signin) ...');
  let jwt = loadCachedJwt();
  if (jwt) {
    // Validate the cached token before reusing.
    const probe = await fetch(`${API_V1}/auth/user/me`, { headers: { 'xc-auth': jwt } });
    if (!probe.ok) {
      console.log('[smoke]   cached jwt expired; signing in afresh');
      jwt = null;
    }
  }
  if (!jwt) jwt = await apiSignin();
  if (!jwt) {
    console.warn(
      '[smoke] WARN: could not obtain admin jwt -- did you run ./apps/nocodb/seed.sh ? ' +
        'base-list / table-grid / table-form / settings-drawer surfaces will redirect.',
    );
  } else {
    console.log('[smoke]   jwt ok');
  }

  console.log('[smoke] resolving fixture refs (baseId, tableId, viewIds) ...');
  const refs = jwt ? await resolveFixtureRefs(jwt) : null;
  if (!refs) {
    console.warn(
      '[smoke] WARN: could not resolve fixture refs -- table-grid + table-form ' +
        'surfaces will fall back to /#/ dashboard.',
    );
  } else {
    console.log(`[smoke]   base=${refs.baseId} table=${refs.articlesTableId} view=${refs.articlesGridViewId}`);
  }

  mkdirSync(OUT_DIR, { recursive: true });

  const results: Array<{ category: DefectCategory; baseline: string; defect: string; record: DefectRecord }> = [];
  for (const cat of ['layout', 'color', 'missing', 'truncation', 'zorder', 'contrast'] as DefectCategory[]) {
    const spec = picks[cat];
    console.log(`[smoke] running ${cat} via ${spec.primitive} on ${spec.surface} ${spec.selector}`);
    try {
      const r = await runOne(cat, spec, refs, jwt);
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
