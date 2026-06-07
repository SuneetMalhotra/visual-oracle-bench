// capture/drivers/gitlab-ce.ts
//
// Per-app driver for GitLab CE. Mirrors tests/smoke_gitlab_ce_pipeline.ts.
// Login is browser-side (Devise CSRF dance), so the `bootstrap()` only
// validates that the upstream sign-in page is reachable; the actual login
// happens inside `authenticate()` per context.

import type { BrowserContext, Page } from 'playwright';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { PerAppDriver, AppSession, PointSpec } from '../per_app.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '../../');

const ROOT_USER = 'root';
const ALICE_USER = 'alice';
const PASSWORD = 'voracle-seed-Pa55word!';

const SURFACE_PATH: Record<string, string> = {
  login: '/users/sign_in',
  project: '/engineering/oracle-bench-core',
  'mr-list': '/engineering/oracle-bench-core/-/merge_requests',
  'issue-view': '/engineering/oracle-bench-core/-/issues/1',
  admin: '/admin',
};

const SURFACE_LOGIN: Record<string, 'none' | 'alice' | 'root'> = {
  login: 'none',
  project: 'alice',
  'mr-list': 'alice',
  'issue-view': 'alice',
  admin: 'root',
};

interface GlSession extends AppSession {
  signInReachable: boolean;
}

async function browserLogin(
  baseUrl: string,
  ctx: BrowserContext,
  username: string,
  password: string,
): Promise<boolean> {
  const page = await ctx.newPage();
  try {
    await page.goto(`${baseUrl}/users/sign_in`, { waitUntil: 'networkidle', timeout: 30_000 });
    await page.fill('#user_login', username);
    await page.fill('#user_password', password);
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30_000 }),
      page.click("button[type='submit'], input[type='submit'], .gl-button[type='submit']"),
    ]);
    return !page.url().includes('/users/sign_in');
  } catch {
    return false;
  } finally {
    await page.close();
  }
}

export function gitlabCeDriver(): PerAppDriver {
  const baseUrl = process.env.GITLAB_BASE_URL ?? 'http://localhost:8080';
  return {
    app: 'gitlab-ce',
    injectionPointsPath: resolve(REPO_ROOT, 'apps/gitlab-ce/injection-points.yaml'),
    outDir: resolve(REPO_ROOT, 'data/images/gitlab-ce'),
    baseUrl,
    async healthcheck() {
      const r = await fetch(`${baseUrl}/-/health`);
      if (!r.ok) throw new Error(`GitLab health returned ${r.status}`);
    },
    async bootstrap(): Promise<GlSession> {
      const r = await fetch(`${baseUrl}/users/sign_in`);
      return { signInReachable: r.ok };
    },
    async authenticate(ctx: BrowserContext, session: AppSession, spec: PointSpec) {
      const s = session as GlSession;
      const need = SURFACE_LOGIN[spec.surface] ?? 'none';
      if (need === 'none') return;
      if (!s.signInReachable) throw new Error(`${spec.id}: GitLab sign_in not reachable`);
      const user = need === 'root' ? ROOT_USER : ALICE_USER;
      const ok = await browserLogin(baseUrl, ctx, user, PASSWORD);
      if (!ok) throw new Error(`${spec.id}: ${user} login failed`);
    },
    async navigate(page: Page, spec: PointSpec, _session: AppSession) {
      const path = SURFACE_PATH[spec.surface] ?? '/';
      await page.goto(baseUrl + path, { waitUntil: 'networkidle', timeout: 30_000 });
      await page.waitForTimeout(800);
    },
  };
}
