// capture/drivers/mattermost.ts
//
// Per-app driver for Mattermost. Mirrors tests/smoke_mattermost_pipeline.ts.

import type { BrowserContext, Page } from 'playwright';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { PerAppDriver, AppSession, PointSpec } from '../per_app.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '../../');

const ADMIN_USER = 'admin';
const ALICE_USER = 'alice';
const PASSWORD = 'voracle-seed-Pa55word!';

const SURFACE_PATH: Record<string, string> = {
  login: '/login',
  'channel-list': '/engineering/channels/town-square',
  'channel-view': '/engineering/channels/backend',
  'profile-modal': '/engineering/channels/backend',
  settings: '/admin_console/user_management/users',
};

const SURFACE_LOGIN: Record<string, 'none' | 'alice' | 'admin'> = {
  login: 'none',
  'channel-list': 'alice',
  'channel-view': 'alice',
  'profile-modal': 'alice',
  settings: 'admin',
};

interface MmSession extends AppSession {
  aliceToken: string | null;
  adminToken: string | null;
}

async function apiLogin(apiBase: string, loginId: string, password: string): Promise<string | null> {
  try {
    const r = await fetch(`${apiBase}/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login_id: loginId, password }),
    });
    if (!r.ok) return null;
    return r.headers.get('token') ?? r.headers.get('Token');
  } catch {
    return null;
  }
}

export function mattermostDriver(): PerAppDriver {
  const baseUrl = process.env.MM_BASE_URL ?? 'http://localhost:8065';
  const apiBase = `${baseUrl}/api/v4`;
  return {
    app: 'mattermost',
    injectionPointsPath: resolve(REPO_ROOT, 'apps/mattermost/injection-points.yaml'),
    outDir: resolve(REPO_ROOT, 'data/images/mattermost'),
    baseUrl,
    async healthcheck() {
      const r = await fetch(`${apiBase}/system/ping`);
      if (!r.ok) throw new Error(`Mattermost ping returned ${r.status}`);
    },
    async bootstrap(): Promise<MmSession> {
      const aliceToken = await apiLogin(apiBase, ALICE_USER, PASSWORD);
      const adminToken = await apiLogin(apiBase, ADMIN_USER, PASSWORD);
      return { aliceToken, adminToken };
    },
    async authenticate(ctx: BrowserContext, session: AppSession, spec: PointSpec) {
      const s = session as MmSession;
      const need = SURFACE_LOGIN[spec.surface] ?? 'none';
      const token = need === 'alice' ? s.aliceToken : need === 'admin' ? s.adminToken : null;
      if (need !== 'none' && !token) {
        throw new Error(`${spec.id}: surface "${spec.surface}" needs ${need} login, no token`);
      }
      if (!token) return;
      const url = new URL(baseUrl);
      await ctx.addCookies([
        {
          name: 'MMAUTHTOKEN',
          value: token,
          domain: url.hostname,
          path: '/',
          httpOnly: true,
          secure: url.protocol === 'https:',
          sameSite: 'Lax',
        },
        {
          name: 'MMUSERID',
          value: 'seeded-by-capture-corpus',
          domain: url.hostname,
          path: '/',
          httpOnly: false,
          secure: url.protocol === 'https:',
          sameSite: 'Lax',
        },
      ]);
    },
    async navigate(page: Page, spec: PointSpec, _session: AppSession) {
      const path = SURFACE_PATH[spec.surface] ?? '/';
      await page.goto(baseUrl + path, { waitUntil: 'networkidle', timeout: 30_000 });
      await page.waitForTimeout(800);
      if (spec.surface === 'profile-modal') {
        try {
          await page.waitForSelector('.post:not(.post--system) .post__header .profile-icon', {
            timeout: 15_000,
          });
          await page.click('.post:not(.post--system) .post__header .profile-icon');
          await page.waitForSelector('.user-popover', { timeout: 5_000 });
          await page.waitForTimeout(300);
        } catch {
          /* selector drift: continue with whatever is on-screen */
        }
      }
    },
  };
}
