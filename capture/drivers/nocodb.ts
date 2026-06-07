// capture/drivers/nocodb.ts
//
// Per-app driver for NocoDB. Mirrors tests/smoke_nocodb_pipeline.ts.
// Surfaces are parameterized by base/table/view IDs resolved from the
// NocoDB REST surface at bootstrap time.

import type { BrowserContext, Page } from 'playwright';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';

import type { PerAppDriver, AppSession, PointSpec } from '../per_app.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '../../');

const ADMIN_EMAIL = 'admin@voracle.test';
const ADMIN_PASSWORD = 'voracle-seed-Pa55word!';
const BASE_NAME = 'voracle-fixture';
const TABLE_ARTICLES = 'Articles';

interface FixtureRefs {
  baseId: string;
  articlesTableId: string;
  articlesGridViewId: string;
  articlesFormViewId: string;
}

interface NcSession extends AppSession {
  jwt: string | null;
  refs: FixtureRefs | null;
}

function surfacePath(surface: string, refs: FixtureRefs | null): string {
  if (surface === 'login') return '/#/signin';
  if (!refs) {
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
    default:
      return '/#/';
  }
}

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
    /* best-effort */
  }
}

async function apiSignin(apiV1: string): Promise<string | null> {
  try {
    const r = await fetch(`${apiV1}/auth/user/signin`, {
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

async function resolveFixtureRefs(apiV2: string, jwt: string): Promise<FixtureRefs | null> {
  async function getJson<T>(url: string): Promise<T | null> {
    try {
      const r = await fetch(url, { headers: { 'xc-auth': jwt, 'xc-token': jwt } });
      if (!r.ok) return null;
      return (await r.json()) as T;
    } catch {
      return null;
    }
  }
  const bases = await getJson<{ list: Array<{ id: string; title: string }> }>(`${apiV2}/meta/bases`);
  if (!bases) return null;
  const base = bases.list.find((b) => b.title === BASE_NAME);
  if (!base) return null;
  const tables = await getJson<{ list: Array<{ id: string; title: string; table_name: string }> }>(
    `${apiV2}/meta/bases/${base.id}/tables`,
  );
  if (!tables) return null;
  const articles = tables.list.find((t) => t.title === TABLE_ARTICLES || t.table_name === TABLE_ARTICLES);
  if (!articles) return null;
  const views = await getJson<{ list: Array<{ id: string; title: string; type: number }> }>(
    `${apiV2}/meta/tables/${articles.id}/views`,
  );
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

export function nocodbDriver(): PerAppDriver {
  const baseUrl = process.env.NC_BASE_URL ?? 'http://localhost:8080';
  const apiV1 = `${baseUrl}/api/v1`;
  const apiV2 = `${baseUrl}/api/v2`;
  const jwtFile = resolve(REPO_ROOT, 'apps/nocodb/.admin-jwt');
  return {
    app: 'nocodb',
    injectionPointsPath: resolve(REPO_ROOT, 'apps/nocodb/injection-points.yaml'),
    outDir: resolve(REPO_ROOT, 'data/images/nocodb'),
    baseUrl,
    async healthcheck() {
      const r = await fetch(`${apiV1}/health`);
      if (!r.ok) throw new Error(`NocoDB at ${baseUrl} returned ${r.status}`);
    },
    async bootstrap(): Promise<NcSession> {
      let jwt: string | null = null;
      if (existsSync(jwtFile)) {
        const v = readFileSync(jwtFile, 'utf8').trim();
        if (v) jwt = v;
      }
      if (!jwt) jwt = await apiSignin(apiV1);
      const refs = jwt ? await resolveFixtureRefs(apiV2, jwt) : null;
      return { jwt, refs };
    },
    async authenticate(ctx: BrowserContext, session: AppSession, spec: PointSpec) {
      const s = session as NcSession;
      if (spec.surface === 'login') return;
      if (!s.jwt) return; // best-effort
      const url = new URL(baseUrl);
      await ctx.addCookies([
        {
          name: 'xc-auth',
          value: s.jwt,
          domain: url.hostname,
          path: '/',
          httpOnly: false,
          secure: url.protocol === 'https:',
          sameSite: 'Lax',
        },
        {
          name: 'xc-token',
          value: s.jwt,
          domain: url.hostname,
          path: '/',
          httpOnly: false,
          secure: url.protocol === 'https:',
          sameSite: 'Lax',
        },
      ]);
      await ctx.addInitScript((token: string) => {
        try {
          localStorage.setItem('nc-token', token);
          localStorage.setItem('xc-auth', token);
        } catch {
          /* ignore */
        }
      }, s.jwt);
    },
    async navigate(page: Page, spec: PointSpec, session: AppSession) {
      const s = session as NcSession;
      const path = surfacePath(spec.surface, s.refs);
      await page.goto(baseUrl + path, { waitUntil: 'networkidle', timeout: 30_000 });
      await page.waitForTimeout(800);
      if (spec.surface === 'table-grid') {
        await waitForGridStable(page);
        await page.waitForTimeout(200);
      }
    },
  };
}
