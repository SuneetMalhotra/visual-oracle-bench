// apps/excalidraw/seed.ts
//
// Seed an Excalidraw self-hosted instance with the deterministic fixture
// used by the benchmark capture run.
//
// Excalidraw is single-user, IndexedDB / localStorage-backed. There is
// no REST API; the "seed" works by writing the canonical scene JSON
// into the SPA's localStorage BEFORE the SPA bootstraps, then opening
// http://localhost:5500/ which then renders the scene as if the user
// had drawn it.
//
// Fixture spec (pre-registered for the W3 onboarding milestone):
//   - 1 persisted whiteboard with 10 shapes:
//       2 rectangles, 2 ellipses, 2 diamonds, 1 arrow, 1 line,
//       1 text "Visual Oracle Bench Fixture", 1 free-draw
//   - 1 library import with 3 reusable shape items (star, callout, arrow-set)
//   - Fixed view state: zoom = 1.0, scrollX = 0, scrollY = 0, theme = light
//
// This script is idempotent: re-running overwrites the localStorage
// entries with the same content. It is OPTIONAL -- the capture script
// (tests/smoke_excalidraw_pipeline.ts) also seeds via addInitScript
// internally, so this seed.ts is provided for parity with apps/conduit/
// (where seed.sh is REQUIRED) and to support out-of-band manual loads.
//
// Run:
//   npx tsx apps/excalidraw/seed.ts
//   (optionally: EXCALIDRAW_URL=http://localhost:5500 npx tsx ...)

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BASE_URL = process.env.EXCALIDRAW_URL ?? 'http://localhost:5500';
const FIXTURE_DIR = resolve(__dirname, 'fixtures');
const FIXTURE_FILE = resolve(FIXTURE_DIR, 'seed-scene.json');
const LIBRARY_FILE = resolve(FIXTURE_DIR, 'seed-library.json');

// ---------------------------------------------------------------------------
// Deterministic Excalidraw scene
// ---------------------------------------------------------------------------
//
// Element-id, seed, and versionNonce are FIXED constants so re-running
// the seed produces the same canvas state (Excalidraw uses `seed` to
// re-derive the same hand-drawn-feel jitter on every render). DO NOT
// replace these with Math.random()-derived values.
//
// Schema reference:
//   github.com/excalidraw/excalidraw/blob/master/packages/excalidraw/element/types.ts

interface ExSceneElement {
  id: string;
  type: 'rectangle' | 'ellipse' | 'diamond' | 'arrow' | 'line' | 'text' | 'freedraw';
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  strokeColor: string;
  backgroundColor: string;
  fillStyle: 'solid' | 'hachure' | 'cross-hatch';
  strokeWidth: number;
  strokeStyle: 'solid' | 'dashed' | 'dotted';
  roughness: number;
  opacity: number;
  groupIds: string[];
  frameId: string | null;
  roundness: { type: number } | null;
  seed: number;
  version: number;
  versionNonce: number;
  isDeleted: boolean;
  boundElements: null | Array<{ id: string; type: string }>;
  updated: number;
  link: null;
  locked: boolean;
  // text-only:
  text?: string;
  fontSize?: number;
  fontFamily?: number;
  textAlign?: 'left' | 'center' | 'right';
  verticalAlign?: 'top' | 'middle' | 'bottom';
  baseline?: number;
  containerId?: null | string;
  originalText?: string;
  lineHeight?: number;
  // arrow / line / freedraw:
  points?: number[][];
  lastCommittedPoint?: null | number[];
  startBinding?: null | { elementId: string; focus: number; gap: number };
  endBinding?: null | { elementId: string; focus: number; gap: number };
  startArrowhead?: null | 'arrow' | 'bar' | 'triangle';
  endArrowhead?: null | 'arrow' | 'bar' | 'triangle';
  pressures?: number[];
  simulatePressure?: boolean;
}

function baseElement(overrides: Partial<ExSceneElement>): ExSceneElement {
  return {
    id: '',
    type: 'rectangle',
    x: 0,
    y: 0,
    width: 100,
    height: 60,
    angle: 0,
    strokeColor: '#1e1e1e',
    backgroundColor: 'transparent',
    fillStyle: 'solid',
    strokeWidth: 2,
    strokeStyle: 'solid',
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: { type: 3 },
    seed: 1,
    version: 1,
    versionNonce: 1,
    isDeleted: false,
    boundElements: null,
    updated: 1717689600000, // fixed instant: 2024-06-06T16:00:00Z
    link: null,
    locked: false,
    ...overrides,
  };
}

const SCENE_ELEMENTS: ExSceneElement[] = [
  // 2 rectangles
  baseElement({ id: 'voracle-rect-1', type: 'rectangle', x: 100, y: 100, width: 160, height: 100, seed: 1001, versionNonce: 1001 }),
  baseElement({ id: 'voracle-rect-2', type: 'rectangle', x: 320, y: 100, width: 200, height: 120, backgroundColor: '#a5d8ff', fillStyle: 'hachure', seed: 1002, versionNonce: 1002 }),
  // 2 ellipses
  baseElement({ id: 'voracle-ell-1', type: 'ellipse', x: 100, y: 260, width: 120, height: 120, seed: 1003, versionNonce: 1003 }),
  baseElement({ id: 'voracle-ell-2', type: 'ellipse', x: 280, y: 260, width: 180, height: 100, backgroundColor: '#ffec99', fillStyle: 'cross-hatch', seed: 1004, versionNonce: 1004 }),
  // 2 diamonds
  baseElement({ id: 'voracle-dia-1', type: 'diamond', x: 520, y: 100, width: 140, height: 140, seed: 1005, versionNonce: 1005 }),
  baseElement({ id: 'voracle-dia-2', type: 'diamond', x: 520, y: 280, width: 120, height: 120, backgroundColor: '#b2f2bb', fillStyle: 'solid', seed: 1006, versionNonce: 1006 }),
  // 1 arrow (connects rect-1 to ell-1)
  baseElement({
    id: 'voracle-arr-1',
    type: 'arrow',
    x: 180,
    y: 200,
    width: 0,
    height: 60,
    points: [[0, 0], [0, 60]],
    lastCommittedPoint: null,
    startBinding: null,
    endBinding: null,
    startArrowhead: null,
    endArrowhead: 'arrow',
    roundness: { type: 2 },
    seed: 1007,
    versionNonce: 1007,
  }),
  // 1 line
  baseElement({
    id: 'voracle-lin-1',
    type: 'line',
    x: 100,
    y: 420,
    width: 560,
    height: 0,
    points: [[0, 0], [560, 0]],
    lastCommittedPoint: null,
    roundness: { type: 2 },
    seed: 1008,
    versionNonce: 1008,
  }),
  // 1 text
  baseElement({
    id: 'voracle-txt-1',
    type: 'text',
    x: 100,
    y: 460,
    width: 380,
    height: 28,
    text: 'Visual Oracle Bench Fixture',
    fontSize: 24,
    fontFamily: 1,
    textAlign: 'left',
    verticalAlign: 'top',
    baseline: 20,
    containerId: null,
    originalText: 'Visual Oracle Bench Fixture',
    lineHeight: 1.25,
    roundness: null,
    seed: 1009,
    versionNonce: 1009,
  }),
  // 1 free-draw squiggle
  baseElement({
    id: 'voracle-fre-1',
    type: 'freedraw',
    x: 100,
    y: 520,
    width: 200,
    height: 40,
    points: [[0, 0], [20, 10], [40, 0], [60, 20], [80, 0], [100, 30], [120, 10], [140, 25], [160, 5], [180, 20], [200, 0]],
    pressures: [],
    simulatePressure: true,
    lastCommittedPoint: [200, 0],
    roundness: null,
    seed: 1010,
    versionNonce: 1010,
  }),
];

const SCENE_APP_STATE = {
  gridSize: null,
  viewBackgroundColor: '#ffffff',
  theme: 'light',
  currentItemFontFamily: 1,
  currentItemFontSize: 20,
  currentItemStrokeColor: '#1e1e1e',
  currentItemBackgroundColor: 'transparent',
  currentItemFillStyle: 'solid',
  currentItemStrokeWidth: 2,
  currentItemStrokeStyle: 'solid',
  currentItemRoughness: 1,
  currentItemOpacity: 100,
  currentItemRoundness: 'round',
  scrollX: 0,
  scrollY: 0,
  zoom: { value: 1.0 },
  name: 'voracle-bench-fixture',
};

// A 3-item library import. Excalidraw stores libraries as
// `{type:"excalidrawlib", version:2, source:"...", libraryItems:[...]}`.
// Each libraryItem wraps a group of elements; we keep them minimal.
function makeLibraryItem(id: string, name: string, color: string, x: number): {
  status: 'unpublished';
  elements: ExSceneElement[];
  id: string;
  created: number;
  name: string;
} {
  return {
    status: 'unpublished',
    id,
    created: 1717689600000,
    name,
    elements: [
      baseElement({
        id: `${id}-rect`,
        type: 'rectangle',
        x,
        y: 0,
        width: 80,
        height: 80,
        backgroundColor: color,
        fillStyle: 'solid',
        seed: 2000,
        versionNonce: 2000,
      }),
    ],
  };
}

const LIBRARY = {
  type: 'excalidrawlib',
  version: 2,
  source: 'https://github.com/SuneetMalhotra/visual-oracle-bench',
  libraryItems: [
    makeLibraryItem('voracle-lib-star', 'Voracle Star', '#ffd43b', 0),
    makeLibraryItem('voracle-lib-callout', 'Voracle Callout', '#a5d8ff', 100),
    makeLibraryItem('voracle-lib-arrow-set', 'Voracle Arrow Set', '#b2f2bb', 200),
  ],
};

// ---------------------------------------------------------------------------
// Seed routine
// ---------------------------------------------------------------------------

async function writeFixtureToDisk(): Promise<void> {
  mkdirSync(FIXTURE_DIR, { recursive: true });
  const sceneFile = {
    type: 'excalidraw',
    version: 2,
    source: 'https://github.com/SuneetMalhotra/visual-oracle-bench',
    elements: SCENE_ELEMENTS,
    appState: SCENE_APP_STATE,
    files: {},
  };
  writeFileSync(FIXTURE_FILE, JSON.stringify(sceneFile, null, 2));
  writeFileSync(LIBRARY_FILE, JSON.stringify(LIBRARY, null, 2));
  console.log(`[seed] wrote ${FIXTURE_FILE}`);
  console.log(`[seed] wrote ${LIBRARY_FILE}`);
}

async function seedRunningInstance(): Promise<void> {
  // Probe first; the seed is OPTIONAL when Excalidraw isn't running.
  // We attempt the live seed but do not fail if it isn't reachable --
  // the on-disk fixture is the authoritative artifact that the smoke
  // pipeline imports.
  try {
    const r = await fetch(BASE_URL);
    if (!r.ok) {
      console.warn(`[seed] ${BASE_URL} returned ${r.status}; skipping live seed`);
      return;
    }
  } catch (e) {
    console.warn(`[seed] ${BASE_URL} not reachable (${(e as Error).message}); skipping live seed`);
    console.warn('[seed]   the on-disk fixture remains the canonical seed; the');
    console.warn('[seed]   smoke pipeline loads it via Playwright addInitScript.');
    return;
  }

  console.log(`[seed] seeding live Excalidraw at ${BASE_URL} ...`);
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    // Inject localStorage BEFORE the SPA bootstraps. Excalidraw reads:
    //   "excalidraw"       -> JSON-encoded array of scene elements
    //   "excalidraw-state" -> JSON-encoded app state (zoom, scroll, theme, ...)
    //   "excalidraw-library" -> JSON-encoded library items array
    await ctx.addInitScript(
      ({ elements, appState, library }) => {
        try {
          localStorage.setItem('excalidraw', JSON.stringify(elements));
          localStorage.setItem('excalidraw-state', JSON.stringify(appState));
          localStorage.setItem('excalidraw-library', JSON.stringify(library.libraryItems));
        } catch {
          // localStorage may be unavailable in some sandbox configs.
        }
      },
      {
        elements: SCENE_ELEMENTS,
        appState: SCENE_APP_STATE,
        library: LIBRARY,
      },
    );
    const page = await ctx.newPage();
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30_000 });
    await page.waitForTimeout(800);
    console.log('[seed] live seed loaded; localStorage populated.');
  } finally {
    await browser.close();
  }
}

async function main(): Promise<void> {
  await writeFixtureToDisk();
  await seedRunningInstance();
  console.log('[seed] done.');
}

main().catch((e) => {
  console.error('[seed] aborted:', e);
  process.exit(1);
});
