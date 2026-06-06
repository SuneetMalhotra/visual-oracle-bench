// tests/smoke_mattermost_pipeline.ts
//
// W3 smoke test: prove the injection -> capture pipeline works end-to-end
// on Mattermost. Picks one defect per category from
// apps/mattermost/injection-points.yaml, captures one baseline and one
// defect screenshot per category, writes 12 PNGs to data/images/mattermost/.
//
// Pre-requisites (NOT performed by this script):
//   docker compose -f apps/mattermost/docker-compose.yml up --build -d
//   ./apps/mattermost/seed.sh
//
// Run:
//   npx tsx tests/smoke_mattermost_pipeline.ts
//
// Exits non-zero with a structured error on first failure; environmental
// failures (Mattermost unreachable, selector not found, login refused)
// are reported with remediation hints, not silently swallowed.

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
const INJECTION_POINTS = resolve(REPO_ROOT, 'apps/mattermost/injection-points.yaml');
const OUT_DIR = resolve(REPO_ROOT, 'data/images/mattermost');
const BASE_URL = process.env.MM_BASE_URL ?? 'http://localhost:8065';
const API_BASE = `${BASE_URL}/api/v4`;

const ADMIN_USER = 'admin';
const ADMIN_PASSWORD = 'voracle-seed-Pa55word!';
const ALICE_USER = 'alice';
const ALICE_PASSWORD = 'voracle-seed-Pa55word!';

// Deep links for the 4 of 5 surfaces that ARE deep-linkable.
// `profile-modal` is NOT a deep link; we drive it interactively (see runOne).
const SURFACE_PATH: Record<string, string> = {
  login: '/login',
  'channel-list': '/engineering/channels/town-square',
  'channel-view': '/engineering/channels/backend',
  'profile-modal': '/engineering/channels/backend', // base; click sequence in runOne opens the modal
  settings: '/admin_console/user_management/users',
};

// Which user must be logged in for each surface. login is rendered for
// the unauthenticated visitor; settings requires sysadmin (admin).
const SURFACE_LOGIN: Record<string, 'none' | 'alice' | 'admin'> = {
  login: 'none',
  'channel-list': 'alice',
  'channel-view': 'alice',
  'profile-modal': 'alice',
  settings: 'admin',
};

const VIEWPORT = { width: 1440, height: 900 };

interface PointSpec {
  id: string;
  surface: keyof typeof SURFACE_PATH;
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
  const raw = readFileSync(INJECTION_POINTS, 'utf8');
  return parseYaml(raw) as InjectionFile;
}

function pickOnePerCategory(file: InjectionFile): Record<DefectCategory, PointSpec> {
  const out: Partial<Record<DefectCategory, PointSpec>> = {};
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
    const r = await fetch(`${API_BASE}/system/ping`);
    if (!r.ok) {
      throw new Error(`Mattermost ping at ${API_BASE}/system/ping returned ${r.status}`);
    }
  } catch (e) {
    throw new Error(
      `Mattermost not reachable at ${BASE_URL}: ${(e as Error).message}\n` +
        `  -> Run: docker compose -f apps/mattermost/docker-compose.yml up --build -d\n` +
        `  -> Then: ./apps/mattermost/seed.sh`,
    );
  }
}

// /users/login returns the auth token in the "Token" response header.
// We replay that header value into the browser via the "MMAUTHTOKEN"
// cookie (the cookie name Mattermost's webapp reads on every request).
async function apiLogin(loginId: string, password: string): Promise<string | null> {
  try {
    const r = await fetch(`${API_BASE}/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login_id: loginId, password }),
    });
    if (!r.ok) return null;
    // Header name is case-insensitive; node-fetch / undici lowercases.
    const token = r.headers.get('token') ?? r.headers.get('Token');
    return token;
  } catch {
    return null;
  }
}

async function seedAuthCookie(ctx: BrowserContext, token: string): Promise<void> {
  const url = new URL(BASE_URL);
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
      value: 'seeded-by-smoke-test',
      domain: url.hostname,
      path: '/',
      httpOnly: false,
      secure: url.protocol === 'https:',
      sameSite: 'Lax',
    },
  ]);
}

// Drive the profile-popover open from a clean channel-view, so the
// `profile-modal` surface has stable DOM by the time the injection
// primitive runs.
async function openProfileModal(page: Page): Promise<void> {
  // Wait for the first post to render, then click its author avatar.
  // Selector path: .post-list__table .post:first-of-type .post__header .profile-icon
  // (the avatar img inside the post header).
  await page.waitForSelector('.post:not(.post--system) .post__header .profile-icon', {
    timeout: 15_000,
  });
  await page.click('.post:not(.post--system) .post__header .profile-icon');
  await page.waitForSelector('.user-popover', { timeout: 5_000 });
}

async function navigateSurface(page: Page, spec: PointSpec): Promise<void> {
  const url = BASE_URL + SURFACE_PATH[spec.surface];
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
  // React + Redux hydration settle (post-list, sidebar virtualization, etc.)
  await page.waitForTimeout(800);
  if (spec.surface === 'profile-modal') {
    await openProfileModal(page);
    await page.waitForTimeout(300);
  }
}

async function applyPrimitive(
  page: Page,
  spec: PointSpec,
): Promise<DefectRecord> {
  switch (spec.primitive) {
    case 'shift_element': {
      const p = spec.params ?? {};
      return PRIMITIVES.layout(page, spec.selector, p.dx as number, p.dy as number, {
        app: 'mattermost',
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
        { app: 'mattermost', defect_id: spec.id },
      );
    }
    case 'remove_element':
      return PRIMITIVES.missing(page, spec.selector, {
        app: 'mattermost',
        defect_id: spec.id,
      });
    case 'shrink_container': {
      const p = spec.params ?? {};
      return PRIMITIVES.truncation(
        page,
        spec.selector,
        (p.width_pct as number) ?? 0.6,
        { app: 'mattermost', defect_id: spec.id },
      );
    }
    case 'swap_zindex': {
      if (!spec.selector_b) throw new Error(`${spec.id}: swap_zindex needs selector_b`);
      return PRIMITIVES.zorder(page, spec.selector, spec.selector_b, {
        app: 'mattermost',
        defect_id: spec.id,
      });
    }
    case 'reduce_contrast': {
      const p = spec.params ?? {};
      return PRIMITIVES.contrast(
        page,
        spec.selector,
        (p.target_ratio as number) ?? 3.0,
        { app: 'mattermost', defect_id: spec.id },
      );
    }
    default:
      throw new Error(`${spec.id}: unknown primitive ${spec.primitive}`);
  }
}

async function runOne(
  category: DefectCategory,
  spec: PointSpec,
  aliceToken: string | null,
  adminToken: string | null,
): Promise<{ baseline: string; defect: string; record: DefectRecord }> {
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    const need = SURFACE_LOGIN[spec.surface];
    if (need === 'alice') {
      if (!aliceToken) throw new Error(`${spec.id}: surface needs alice login, no token`);
      await seedAuthCookie(ctx, aliceToken);
    } else if (need === 'admin') {
      if (!adminToken) throw new Error(`${spec.id}: surface needs admin login, no token`);
      await seedAuthCookie(ctx, adminToken);
    }

    // ---- BASELINE ----
    const basePage = await ctx.newPage();
    await navigateSurface(basePage, spec);
    const baselinePath = resolve(OUT_DIR, `${spec.id}_baseline.png`);
    await basePage.screenshot({ path: baselinePath, type: 'png', fullPage: false });
    await basePage.close();

    // ---- DEFECT ----
    const defectPage = await ctx.newPage();
    await navigateSurface(defectPage, spec);
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

  console.log('[smoke] verifying Mattermost is up ...');
  await checkUp();

  console.log('[smoke] logging in as alice + admin (cookie auth) ...');
  const aliceToken = await apiLogin(ALICE_USER, ALICE_PASSWORD);
  const adminToken = await apiLogin(ADMIN_USER, ADMIN_PASSWORD);
  if (!aliceToken) {
    console.warn('[smoke] WARN: alice login failed -- did you run ./apps/mattermost/seed.sh ?');
  } else {
    console.log('[smoke]   alice ok');
  }
  if (!adminToken) {
    console.warn('[smoke] WARN: admin login failed -- /admin_console surface will redirect to /login');
  } else {
    console.log('[smoke]   admin ok');
  }

  mkdirSync(OUT_DIR, { recursive: true });

  const results: Array<{ category: DefectCategory; baseline: string; defect: string; record: DefectRecord }> = [];
  for (const cat of ['layout', 'color', 'missing', 'truncation', 'zorder', 'contrast'] as DefectCategory[]) {
    const spec = picks[cat];
    console.log(`[smoke] running ${cat} via ${spec.primitive} on ${spec.surface} ${spec.selector}`);
    try {
      const r = await runOne(cat, spec, aliceToken, adminToken);
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
