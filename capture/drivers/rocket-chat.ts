// capture/drivers/rocket-chat.ts
//
// Per-app driver for Rocket.Chat. Mirrors tests/smoke_rocket_chat_pipeline.ts.

import type { BrowserContext, Page } from 'playwright';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { PerAppDriver, AppSession, PointSpec } from '../per_app.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '../../');

const PASSWORD = 'voracle-seed-Pa55word!';

const SURFACE_PATH: Record<string, string> = {
  login: '/home',
  'channel-sidebar': '/channel/general',
  'channel-view': '/channel/dev',
  'profile-modal': '/channel/dev',
  admin: '/admin/info',
};

const SURFACE_LOGIN: Record<string, 'none' | 'alice' | 'admin'> = {
  login: 'none',
  'channel-sidebar': 'alice',
  'channel-view': 'alice',
  'profile-modal': 'alice',
  admin: 'admin',
};

interface LoginPair {
  authToken: string;
  userId: string;
}

interface RcSession extends AppSession {
  alice: LoginPair | null;
  admin: LoginPair | null;
}

async function apiLogin(apiBase: string, user: string, password: string): Promise<LoginPair | null> {
  try {
    const r = await fetch(`${apiBase}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user, password }),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { data?: { authToken?: string; userId?: string } };
    if (!j.data?.authToken || !j.data?.userId) return null;
    return { authToken: j.data.authToken, userId: j.data.userId };
  } catch {
    return null;
  }
}

export function rocketChatDriver(): PerAppDriver {
  const baseUrl = process.env.ROCKET_BASE_URL ?? 'http://localhost:3001';
  const apiBase = `${baseUrl}/api/v1`;
  return {
    app: 'rocket-chat',
    injectionPointsPath: resolve(REPO_ROOT, 'apps/rocket-chat/injection-points.yaml'),
    outDir: resolve(REPO_ROOT, 'data/images/rocket-chat'),
    baseUrl,
    async healthcheck() {
      const r = await fetch(`${apiBase}/info`);
      if (!r.ok) throw new Error(`Rocket.Chat info returned ${r.status}`);
    },
    async bootstrap(): Promise<RcSession> {
      const alice = await apiLogin(apiBase, 'alice', PASSWORD);
      const admin = await apiLogin(apiBase, 'admin', PASSWORD);
      return { alice, admin };
    },
    async authenticate(ctx: BrowserContext, session: AppSession, spec: PointSpec) {
      const s = session as RcSession;
      const need = SURFACE_LOGIN[spec.surface] ?? 'none';
      const pair = need === 'alice' ? s.alice : need === 'admin' ? s.admin : null;
      if (need !== 'none' && !pair) {
        throw new Error(`${spec.id}: surface "${spec.surface}" needs ${need} login, no token`);
      }
      if (!pair) return;
      await ctx.addInitScript((p: LoginPair) => {
        try {
          const expires = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
          localStorage.setItem('Meteor.loginToken', p.authToken);
          localStorage.setItem('Meteor.loginTokenExpires', expires);
          localStorage.setItem('Meteor.userId', p.userId);
        } catch {
          /* ignore */
        }
      }, pair);
    },
    async navigate(page: Page, spec: PointSpec, _session: AppSession) {
      const path = SURFACE_PATH[spec.surface] ?? '/';
      await page.goto(baseUrl + path, { waitUntil: 'networkidle', timeout: 30_000 });
      await page.waitForTimeout(800);
      if (spec.surface === 'profile-modal') {
        const trigger = '.rcx-message__name, .rcx-message__user-card-trigger, .message-name';
        try {
          await page.waitForSelector(trigger, { timeout: 15_000 });
          await page.click(`${trigger}:first-of-type`);
          await page.waitForSelector('.rcx-user-card', { timeout: 8_000 });
          await page.waitForTimeout(300);
        } catch {
          /* continue */
        }
      }
    },
  };
}
