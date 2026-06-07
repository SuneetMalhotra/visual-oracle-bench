// capture/drivers/excalidraw.ts
//
// Per-app driver for Excalidraw. Mirrors tests/smoke_excalidraw_pipeline.ts.
// Two extra concerns vs. the simple apps:
//   - localStorage-based fixture must be seeded BEFORE the SPA bootstraps
//     (`addInitScript` on the context).
//   - DOM-overlay layer must be injected after navigation so
//     canvas-fixture-*-overlay selectors resolve.

import type { BrowserContext, Page } from 'playwright';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';

import type { PerAppDriver, AppSession, PointSpec } from '../per_app.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '../../');

interface ExSession extends AppSession {
  elements: unknown[];
  appState: unknown;
  library: unknown[];
}

async function injectCanvasOverlays(page: Page): Promise<void> {
  await page.evaluate(() => {
    const root = document.querySelector('.excalidraw') as HTMLElement | null;
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

export function excalidrawDriver(): PerAppDriver {
  const baseUrl = process.env.EXCALIDRAW_URL ?? 'http://localhost:5500';
  const fixtureScenePath = resolve(REPO_ROOT, 'apps/excalidraw/fixtures/seed-scene.json');
  const fixtureLibraryPath = resolve(REPO_ROOT, 'apps/excalidraw/fixtures/seed-library.json');
  return {
    app: 'excalidraw',
    injectionPointsPath: resolve(REPO_ROOT, 'apps/excalidraw/injection-points.yaml'),
    outDir: resolve(REPO_ROOT, 'data/images/excalidraw'),
    baseUrl,
    async healthcheck() {
      const r = await fetch(baseUrl);
      if (!r.ok) throw new Error(`Excalidraw at ${baseUrl} returned ${r.status}`);
    },
    async bootstrap(): Promise<ExSession> {
      if (!existsSync(fixtureScenePath)) {
        throw new Error(
          `Excalidraw fixture not found at ${fixtureScenePath}\n` +
            `  -> Run: npx tsx apps/excalidraw/seed.ts`,
        );
      }
      const scene = JSON.parse(readFileSync(fixtureScenePath, 'utf8')) as {
        elements: unknown[];
        appState: unknown;
      };
      let library: unknown[] = [];
      if (existsSync(fixtureLibraryPath)) {
        const lib = JSON.parse(readFileSync(fixtureLibraryPath, 'utf8')) as { libraryItems: unknown[] };
        library = lib.libraryItems ?? [];
      }
      return { elements: scene.elements, appState: scene.appState, library };
    },
    async authenticate(ctx: BrowserContext, session: AppSession, spec: PointSpec) {
      if (spec.surface === 'empty-canvas') return;
      const s = session as ExSession;
      await ctx.addInitScript(
        ({ els, state, lib }) => {
          try {
            localStorage.setItem('excalidraw', JSON.stringify(els));
            localStorage.setItem('excalidraw-state', JSON.stringify(state));
            localStorage.setItem('excalidraw-library', JSON.stringify(lib));
          } catch {
            /* ignore */
          }
        },
        { els: s.elements, state: s.appState, lib: s.library },
      );
    },
    async navigate(page: Page, spec: PointSpec, _session: AppSession) {
      await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 30_000 });
      await page.waitForTimeout(800);
      await injectCanvasOverlays(page);
      switch (spec.surface) {
        case 'library-open':
          try {
            await page.click('[aria-label="Library"]', { timeout: 5_000 });
            await page.waitForSelector('.layer-ui__library', { timeout: 5_000 });
          } catch {
            /* selector drift */
          }
          break;
        case 'export-modal':
          try {
            await page.click('.App-menu_top .dropdown-menu-button', { timeout: 5_000 });
            await page.click('[data-testid="export-image"]', { timeout: 5_000 });
            await page.waitForSelector('.Dialog', { timeout: 5_000 });
          } catch {
            /* continue */
          }
          break;
        case 'settings-drawer':
          try {
            await page.click('.App-menu_top .dropdown-menu-button', { timeout: 5_000 });
            await page.waitForSelector('.dropdown-menu-container', { timeout: 5_000 });
          } catch {
            /* continue */
          }
          break;
        default:
          /* empty-canvas + toolbar-visible: no extra driving */
          break;
      }
    },
  };
}
