// capture/drivers/cal-com.ts
//
// Per-app driver for Cal.com. Mirrors tests/smoke_cal-com_pipeline.ts.

import type { BrowserContext, Page } from 'playwright';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { PerAppDriver, AppSession, PointSpec } from '../per_app.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '../../');

const ADMIN_EMAIL = 'admin@voracle.test';
const ADMIN_PASSWORD = 'voracle-seed-Pa55word!';

const SURFACE_PATH: Record<string, string> = {
  login: '/auth/login',
  'event-types': '/event-types',
  'booking-page': '/admin/admin-30min',
  'bookings-list': '/bookings/upcoming',
  'admin-settings': '/settings/admin/general',
};

const SURFACE_LOGIN: Record<string, 'none' | 'admin'> = {
  login: 'none',
  'event-types': 'admin',
  'booking-page': 'none',
  'bookings-list': 'admin',
  'admin-settings': 'admin',
};

interface CalSession extends AppSession {
  sessionToken: string | null;
}

async function apiLogin(baseUrl: string): Promise<string | null> {
  try {
    const csrfR = await fetch(`${baseUrl}/api/auth/csrf`);
    if (!csrfR.ok) return null;
    const { csrfToken } = (await csrfR.json()) as { csrfToken: string };
    const initialCookies: string[] = [];
    if (typeof csrfR.headers.getSetCookie === 'function') {
      for (const c of csrfR.headers.getSetCookie() as string[]) {
        const k = c.split(';')[0];
        if (k) initialCookies.push(k);
      }
    }
    const body = new URLSearchParams({
      csrfToken,
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      callbackUrl: '/',
    });
    const r = await fetch(`${baseUrl}/api/auth/callback/credentials`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(initialCookies.length ? { Cookie: initialCookies.join('; ') } : {}),
      },
      body: body.toString(),
      redirect: 'manual',
    });
    if (typeof r.headers.getSetCookie === 'function') {
      for (const c of r.headers.getSetCookie() as string[]) {
        const m = c.match(/next-auth\.session-token=([^;]+)/);
        if (m) return decodeURIComponent(m[1]);
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function calComDriver(): PerAppDriver {
  const baseUrl = process.env.CAL_BASE_URL ?? 'http://localhost:3001';
  return {
    app: 'cal-com',
    injectionPointsPath: resolve(REPO_ROOT, 'apps/cal-com/injection-points.yaml'),
    outDir: resolve(REPO_ROOT, 'data/images/cal-com'),
    baseUrl,
    async healthcheck() {
      const r = await fetch(`${baseUrl}/api/auth/session`);
      if (!r.ok) throw new Error(`Cal.com at ${baseUrl} returned ${r.status}`);
    },
    async bootstrap(): Promise<CalSession> {
      const sessionToken = await apiLogin(baseUrl);
      return { sessionToken };
    },
    async authenticate(ctx: BrowserContext, session: AppSession, spec: PointSpec) {
      const s = session as CalSession;
      const need = SURFACE_LOGIN[spec.surface] ?? 'none';
      if (need === 'none') return;
      if (!s.sessionToken) throw new Error(`${spec.id}: admin session-token unavailable`);
      const url = new URL(baseUrl);
      await ctx.addCookies([
        {
          name: 'next-auth.session-token',
          value: s.sessionToken,
          domain: url.hostname,
          path: '/',
          httpOnly: true,
          secure: url.protocol === 'https:',
          sameSite: 'Lax',
        },
      ]);
    },
    async navigate(page: Page, spec: PointSpec, _session: AppSession) {
      const path = SURFACE_PATH[spec.surface] ?? '/';
      await page.goto(baseUrl + path, { waitUntil: 'networkidle', timeout: 30_000 });
      await page.waitForTimeout(spec.surface === 'booking-page' ? 1_200 : 600);
    },
  };
}
