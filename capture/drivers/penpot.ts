// capture/drivers/penpot.ts
//
// Per-app driver for Penpot. Mirrors tests/smoke_penpot_pipeline.ts.
// Penpot's surfaces are PARAMETERIZED by IDs that come from a seed-time
// fixture file (apps/penpot/fixtures/seed-fixture.json); the driver
// reads that JSON during bootstrap and uses the IDs to build per-surface
// URLs.

import type { BrowserContext, Page } from 'playwright';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';

import type { PerAppDriver, AppSession, PointSpec } from '../per_app.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '../../');

const ADMIN_EMAIL = 'voracle-admin@voracle.test';
const ADMIN_PASSWORD = 'voracle-seed-Pa55word!';

interface FixtureMeta {
  team: { id: string; name: string };
  project: { id: string; name: string };
  file: { id: string; name: string };
}

interface PenpotSession extends AppSession {
  authToken: string | null;
  meta: FixtureMeta | null;
}

async function apiLoginAndGetCookie(apiBase: string): Promise<string | null> {
  try {
    const r = await fetch(`${apiBase}/command/login-with-password`, {
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

function surfacePath(surface: string, meta: FixtureMeta | null): string {
  if (!meta && surface !== 'login') return '/#/dashboard/projects';
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
    default:
      return '/#/dashboard/projects';
  }
}

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
    const overlays: Array<{
      cls: string; x: number; y: number; w: number; h: number; text?: string; bg: string; color: string;
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

export function penpotDriver(): PerAppDriver {
  const baseUrl = process.env.PENPOT_URL ?? 'http://localhost:9001';
  const apiBase = `${baseUrl}/api/rpc`;
  const fixtureMetaPath = resolve(REPO_ROOT, 'apps/penpot/fixtures/seed-fixture.json');
  return {
    app: 'penpot',
    injectionPointsPath: resolve(REPO_ROOT, 'apps/penpot/injection-points.yaml'),
    outDir: resolve(REPO_ROOT, 'data/images/penpot'),
    baseUrl,
    async healthcheck() {
      const r = await fetch(`${apiBase}/command/get-profile`, { method: 'POST', body: '{}' });
      if (r.status >= 500) throw new Error(`Penpot backend returned ${r.status}`);
    },
    async bootstrap(): Promise<PenpotSession> {
      const authToken = await apiLoginAndGetCookie(apiBase);
      const meta = existsSync(fixtureMetaPath)
        ? (JSON.parse(readFileSync(fixtureMetaPath, 'utf8')) as FixtureMeta)
        : null;
      return { authToken, meta };
    },
    async authenticate(ctx: BrowserContext, session: AppSession, spec: PointSpec) {
      const s = session as PenpotSession;
      if (spec.surface === 'login') return;
      if (!s.authToken) return; // best-effort; many surfaces will then 401
      const url = new URL(baseUrl);
      await ctx.addCookies([
        {
          name: 'auth-token',
          value: s.authToken,
          domain: url.hostname,
          path: '/',
          httpOnly: true,
          secure: url.protocol === 'https:',
          sameSite: 'Lax',
        },
      ]);
    },
    async navigate(page: Page, spec: PointSpec, session: AppSession) {
      const s = session as PenpotSession;
      const path = surfacePath(spec.surface, s.meta);
      await page.goto(baseUrl + path, { waitUntil: 'networkidle', timeout: 30_000 });
      await page.waitForTimeout(1_000);
      await injectCanvasOverlays(page);
    },
  };
}
