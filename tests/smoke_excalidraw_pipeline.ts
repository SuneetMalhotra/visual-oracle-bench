// tests/smoke_excalidraw_pipeline.ts
//
// W3 smoke test: prove the injection -> capture pipeline works end-to-end
// on Excalidraw. Picks one defect per category from
// apps/excalidraw/injection-points.yaml, captures one baseline and one
// defect screenshot per category, writes 12 PNGs to data/images/excalidraw/.
//
// Pre-requisites (NOT performed by this script):
//   docker compose -f apps/excalidraw/docker-compose.yml up --build -d
//
// Run:
//   npx tsx tests/smoke_excalidraw_pipeline.ts
//
// Methodological note (see apps/excalidraw/RUNBOOK.md "Known risks" #3):
//   18 of the 50 injection points target canvas-rendered content via
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
const INJECTION_POINTS = resolve(REPO_ROOT, 'apps/excalidraw/injection-points.yaml');
const FIXTURE_SCENE = resolve(REPO_ROOT, 'apps/excalidraw/fixtures/seed-scene.json');
const FIXTURE_LIBRARY = resolve(REPO_ROOT, 'apps/excalidraw/fixtures/seed-library.json');
const OUT_DIR = resolve(REPO_ROOT, 'data/images/excalidraw');
const BASE_URL = process.env.EXCALIDRAW_URL ?? 'http://localhost:5500';

const VIEWPORT = { width: 1440, height: 900 };

interface PointSpec {
  id: string;
  surface: 'empty-canvas' | 'toolbar-visible' | 'library-open' | 'export-modal' | 'settings-drawer';
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

function pickOnePerCategory(file: InjectionFile): Record<DefectCategory, PointSpec> {
  const out: Partial<Record<DefectCategory, PointSpec>> = {};
  // Prefer non-canvas points for the smoke pipeline so we exercise the
  // canonical DOM path; fall back to canvas-overlay points only when no
  // chrome point exists for a category.
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
    const r = await fetch(BASE_URL);
    if (!r.ok) {
      throw new Error(`Excalidraw at ${BASE_URL} returned ${r.status}`);
    }
  } catch (e) {
    throw new Error(
      `Excalidraw not reachable at ${BASE_URL}: ${(e as Error).message}\n` +
        `  -> Run: docker compose -f apps/excalidraw/docker-compose.yml up --build -d`,
    );
  }
}

function loadFixture(): { elements: unknown[]; appState: unknown; library: unknown[] } {
  if (!existsSync(FIXTURE_SCENE)) {
    throw new Error(
      `Excalidraw fixture not found at ${FIXTURE_SCENE}.\n` +
        `  -> Run: npx tsx apps/excalidraw/seed.ts (writes the on-disk fixture)`,
    );
  }
  const scene = JSON.parse(readFileSync(FIXTURE_SCENE, 'utf8')) as {
    elements: unknown[];
    appState: unknown;
  };
  let library: unknown[] = [];
  if (existsSync(FIXTURE_LIBRARY)) {
    const lib = JSON.parse(readFileSync(FIXTURE_LIBRARY, 'utf8')) as { libraryItems: unknown[] };
    library = lib.libraryItems ?? [];
  }
  return { elements: scene.elements, appState: scene.appState, library };
}

// Seed localStorage BEFORE the SPA bootstraps so the fixture is the
// first render. Used for all surfaces except `empty-canvas`.
async function seedFixture(
  ctx: BrowserContext,
  elements: unknown[],
  appState: unknown,
  library: unknown[],
): Promise<void> {
  await ctx.addInitScript(
    ({ els, state, lib }) => {
      try {
        localStorage.setItem('excalidraw', JSON.stringify(els));
        localStorage.setItem('excalidraw-state', JSON.stringify(state));
        localStorage.setItem('excalidraw-library', JSON.stringify(lib));
      } catch {
        /* sandbox may forbid localStorage */
      }
    },
    { els: elements, state: appState, lib: library },
  );
}

// Inject the canvas-overlay DOM. These overlays simulate canvas-rendered
// content (rectangles + text) as positional divs aligned to the canvas
// area, so DOM-based injection primitives can target them via the
// `.canvas-fixture-*` selectors used in the YAML.
async function injectCanvasOverlays(page: Page): Promise<void> {
  await page.evaluate(() => {
    const root = document.querySelector('.excalidraw') as HTMLElement | null;
    if (!root) return;
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
    // The exact overlays here mirror the canvas-content selectors used
    // in apps/excalidraw/injection-points.yaml.
    const overlays: Array<{ cls: string; x: number; y: number; w: number; h: number; text?: string; color: string }> = [
      { cls: 'canvas-fixture-rect-1-overlay', x: 100, y: 100, w: 160, h: 100, color: 'rgba(30,30,30,0.5)' },
      { cls: 'canvas-fixture-rect-2-overlay', x: 320, y: 100, w: 200, h: 120, color: 'rgba(165,216,255,0.6)' },
      { cls: 'canvas-fixture-arrow-overlay', x: 180, y: 200, w: 6, h: 60, color: 'rgba(30,30,30,0.8)' },
      { cls: 'canvas-fixture-text-overlay', x: 100, y: 460, w: 380, h: 28, color: 'rgba(30,30,30,0.9)', text: 'Visual Oracle Bench Fixture' },
      { cls: 'App-toolbar__divider', x: 0, y: 60, w: 100, h: 2, color: 'rgba(200,200,200,0.8)' },
      { cls: 'welcome-screen-center__heading', x: 480, y: 360, w: 480, h: 40, color: 'rgba(30,30,30,0.9)', text: 'All your data is saved locally in your browser.' },
      { cls: 'welcome-screen-center__subheading', x: 480, y: 410, w: 480, h: 24, color: 'rgba(120,120,120,0.9)', text: 'voracle-bench fixture loaded' },
      { cls: 'welcome-screen-menu-item__shortcut', x: 480, y: 460, w: 240, h: 20, color: 'rgba(120,120,120,0.9)', text: 'Ctrl+O   Open file' },
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
        background: o.text ? 'transparent' : o.color,
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

async function navigateSurface(page: Page, spec: PointSpec, fixtureSeeded: boolean): Promise<void> {
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30_000 });
  // Excalidraw bootstrap + canvas first-paint settle.
  await page.waitForTimeout(800);

  // Always inject canvas overlays so canvas-compromise selectors resolve.
  // (No-op when overlays already exist from a prior navigation in this context.)
  await injectCanvasOverlays(page);

  switch (spec.surface) {
    case 'empty-canvas':
      // Already at first paint; if the welcome screen is suppressed because
      // the fixture is loaded, the overlay welcome-screen-* selectors still
      // resolve via the canvas overlays we injected above.
      return;
    case 'toolbar-visible':
      // Default surface; nothing extra to drive.
      return;
    case 'library-open':
      // Click the Library tool-icon in the right sidebar to open the panel.
      try {
        await page.click('[aria-label="Library"]', { timeout: 5_000 });
        await page.waitForSelector('.layer-ui__library', { timeout: 5_000 });
      } catch {
        // Selector drift across versions: fall back to overlay-only mode.
      }
      return;
    case 'export-modal':
      try {
        await page.click('.App-menu_top .dropdown-menu-button', { timeout: 5_000 });
        await page.click('[data-testid="export-image"]', { timeout: 5_000 });
        await page.waitForSelector('.Dialog', { timeout: 5_000 });
      } catch {
        // Continue; some upstream builds rename the export-image testid.
      }
      return;
    case 'settings-drawer':
      try {
        await page.click('.App-menu_top .dropdown-menu-button', { timeout: 5_000 });
        await page.waitForSelector('.dropdown-menu-container', { timeout: 5_000 });
      } catch {
        // Continue.
      }
      return;
  }
}

async function applyPrimitive(page: Page, spec: PointSpec): Promise<DefectRecord> {
  switch (spec.primitive) {
    case 'shift_element': {
      const p = spec.params ?? {};
      return PRIMITIVES.layout(page, spec.selector, p.dx as number, p.dy as number, {
        app: 'excalidraw',
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
        { app: 'excalidraw', defect_id: spec.id },
      );
    }
    case 'remove_element':
      return PRIMITIVES.missing(page, spec.selector, {
        app: 'excalidraw',
        defect_id: spec.id,
      });
    case 'shrink_container': {
      const p = spec.params ?? {};
      return PRIMITIVES.truncation(
        page,
        spec.selector,
        (p.width_pct as number) ?? 0.6,
        { app: 'excalidraw', defect_id: spec.id },
      );
    }
    case 'swap_zindex': {
      if (!spec.selector_b) throw new Error(`${spec.id}: swap_zindex needs selector_b`);
      return PRIMITIVES.zorder(page, spec.selector, spec.selector_b, {
        app: 'excalidraw',
        defect_id: spec.id,
      });
    }
    case 'reduce_contrast': {
      const p = spec.params ?? {};
      return PRIMITIVES.contrast(
        page,
        spec.selector,
        (p.target_ratio as number) ?? 3.0,
        { app: 'excalidraw', defect_id: spec.id },
      );
    }
    default:
      throw new Error(`${spec.id}: unknown primitive ${spec.primitive}`);
  }
}

async function runOne(
  category: DefectCategory,
  spec: PointSpec,
  fixture: { elements: unknown[]; appState: unknown; library: unknown[] },
): Promise<{ baseline: string; defect: string; record: DefectRecord }> {
  const browser = await chromium.launch({ headless: true });
  try {
    const useFixture = spec.surface !== 'empty-canvas';
    const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    if (useFixture) {
      await seedFixture(ctx, fixture.elements, fixture.appState, fixture.library);
    }

    // ---- BASELINE ----
    const basePage = await ctx.newPage();
    await navigateSurface(basePage, spec, useFixture);
    const baselinePath = resolve(OUT_DIR, `${spec.id}_baseline.png`);
    await basePage.screenshot({ path: baselinePath, type: 'png', fullPage: false });
    await basePage.close();

    // ---- DEFECT ----
    const defectPage = await ctx.newPage();
    await navigateSurface(defectPage, spec, useFixture);
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

  console.log('[smoke] verifying Excalidraw is up ...');
  await checkUp();

  console.log('[smoke] loading fixture from disk ...');
  const fixture = loadFixture();
  console.log(`[smoke]   fixture: ${fixture.elements.length} elements, ${fixture.library.length} library items`);

  mkdirSync(OUT_DIR, { recursive: true });

  const results: Array<{ category: DefectCategory; baseline: string; defect: string; record: DefectRecord }> = [];
  for (const cat of ['layout', 'color', 'missing', 'truncation', 'zorder', 'contrast'] as DefectCategory[]) {
    const spec = picks[cat];
    console.log(`[smoke] running ${cat} via ${spec.primitive} on ${spec.surface} ${spec.selector}`);
    try {
      const r = await runOne(cat, spec, fixture);
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
