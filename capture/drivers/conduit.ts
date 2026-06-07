// capture/drivers/conduit.ts
//
// Per-app driver for Conduit (RealWorld), called by scripts/capture_corpus.ts
// via capture/per_app.ts. Mirrors the auth + navigation semantics of
// tests/smoke_conduit_pipeline.ts so the all-50 capture produces images
// equivalent to the 6-point smoke pairs.

import type { BrowserContext, Page } from 'playwright';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { PerAppDriver, AppSession, PointSpec } from '../per_app.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '../../');

const SURFACE_PATH: Record<string, string> = {
  home: '/',
  article: '/article/visual-oracle-bench-overview',
  profile: '/profile/alice',
  editor: '/editor',
  settings: '/settings',
};

interface ConduitSession extends AppSession {
  token: string | null;
}

export function conduitDriver(): PerAppDriver {
  const baseUrl = process.env.CONDUIT_FRONTEND_URL ?? 'http://localhost:4100';
  const backendUrl = process.env.CONDUIT_BACKEND_URL ?? 'http://localhost:3000';
  return {
    app: 'conduit',
    injectionPointsPath: resolve(REPO_ROOT, 'apps/conduit/injection-points.yaml'),
    outDir: resolve(REPO_ROOT, 'data/images/conduit'),
    baseUrl,
    async healthcheck() {
      const r = await fetch(baseUrl);
      if (!r.ok) throw new Error(`Conduit frontend at ${baseUrl} returned ${r.status}`);
    },
    async bootstrap(): Promise<ConduitSession> {
      let token: string | null = null;
      try {
        const r = await fetch(`${backendUrl}/api/users/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user: { email: 'alice@voracle.test', password: 'voracle-seed-Pa55word!' },
          }),
        });
        if (r.ok) {
          const data = (await r.json()) as { user?: { token?: string } };
          token = data.user?.token ?? null;
        }
      } catch {
        /* leave token null */
      }
      return { token };
    },
    async authenticate(ctx: BrowserContext, session: AppSession, _spec: PointSpec) {
      const s = session as ConduitSession;
      if (!s.token) return;
      await ctx.addInitScript((token) => {
        try {
          localStorage.setItem('jwtToken', token);
          localStorage.setItem('token', token);
        } catch {
          /* ignore */
        }
      }, s.token);
    },
    async navigate(page: Page, spec: PointSpec, _session: AppSession) {
      const path = SURFACE_PATH[spec.surface] ?? '/';
      await page.goto(baseUrl + path, { waitUntil: 'networkidle', timeout: 30_000 });
      await page.waitForTimeout(400); // Angular hydration settle
    },
  };
}
