// tests/smoke_rocket_chat_pipeline.ts
//
// W4 smoke test: prove the injection -> capture pipeline works end-to-end
// on Rocket.Chat. Picks one defect per category from
// apps/rocket-chat/injection-points.yaml, captures one baseline and one
// defect screenshot per category, writes 12 PNGs to data/images/rocket-chat/.
//
// Pre-requisites (NOT performed by this script):
//   docker compose -f apps/rocket-chat/docker-compose.yml up -d
//   while ! curl -sf http://localhost:3001/api/info; do sleep 3; done
//   ./apps/rocket-chat/seed.sh
//
// Run:
//   npx tsx tests/smoke_rocket_chat_pipeline.ts
//
// Exits non-zero with a structured error on first failure; environmental
// failures (Rocket.Chat unreachable, login refused, selector not found)
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
const INJECTION_POINTS = resolve(REPO_ROOT, 'apps/rocket-chat/injection-points.yaml');
const OUT_DIR = resolve(REPO_ROOT, 'data/images/rocket-chat');
const BASE_URL = process.env.ROCKET_BASE_URL ?? 'http://localhost:3001';
const API_BASE = `${BASE_URL}/api/v1`;

const ADMIN_USER = 'admin';
const ADMIN_PASSWORD = 'voracle-seed-Pa55word!';
const ALICE_USER = 'alice';
const ALICE_PASSWORD = 'voracle-seed-Pa55word!';

// Deep links for the 4 of 5 surfaces that are deep-linkable. `profile-modal`
// is NOT deep-linkable; we drive it via a scripted click in openProfileModal().
const SURFACE_PATH: Record<string, string> = {
  login: '/home',
  'channel-sidebar': '/channel/general',
  'channel-view': '/channel/dev',
  'profile-modal': '/channel/dev', // base; click sequence in runOne opens the modal
  admin: '/admin/info',
};

// Which user must be logged in for each surface.
//   login: deliberately UNauthenticated (the page itself is what we capture).
//   channel-sidebar / channel-view / profile-modal: any logged-in user (alice).
//   admin: sysadmin only (admin).
const SURFACE_LOGIN: Record<string, 'none' | 'alice' | 'admin'> = {
  login: 'none',
  'channel-sidebar': 'alice',
  'channel-view': 'alice',
  'profile-modal': 'alice',
  admin: 'admin',
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
    const r = await fetch(`${API_BASE}/info`);
    if (!r.ok) {
      throw new Error(`Rocket.Chat info at ${API_BASE}/info returned ${r.status}`);
    }
  } catch (e) {
    throw new Error(
      `Rocket.Chat not reachable at ${BASE_URL}: ${(e as Error).message}\n` +
        `  -> Run: docker compose -f apps/rocket-chat/docker-compose.yml up -d\n` +
        `  -> Wait: while ! curl -sf ${API_BASE}/info; do sleep 3; done\n` +
        `  -> Then: ./apps/rocket-chat/seed.sh`,
    );
  }
}

// /api/v1/login returns { status: "success", data: { authToken, userId } }.
// We then seed both as LocalStorage keys for the Meteor client (it reads
// `Meteor.loginToken` + `Meteor.userId` from LocalStorage on app boot).
interface LoginPair {
  authToken: string;
  userId: string;
}

async function apiLogin(user: string, password: string): Promise<LoginPair | null> {
  try {
    const r = await fetch(`${API_BASE}/login`, {
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

async function seedAuthStorage(ctx: BrowserContext, pair: LoginPair): Promise<void> {
  // Meteor's auth-token storage is in LocalStorage under fixed keys
  // (`Meteor.loginToken` + `Meteor.userId` + a token-expiry); we set
  // these via an init script that runs in every new page in the context.
  await ctx.addInitScript(({ authToken, userId }: LoginPair) => {
    try {
      // Long expiry so the session does not lapse mid-capture.
      const expires = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
      localStorage.setItem('Meteor.loginToken', authToken);
      localStorage.setItem('Meteor.loginTokenExpires', expires);
      localStorage.setItem('Meteor.userId', userId);
    } catch {
      /* ignore */
    }
  }, pair);
}

// The user-card popover is opened by clicking a message author's avatar
// or name. We wait for the first non-system message to render, then click
// its name link.
async function openProfileModal(page: Page): Promise<void> {
  // .rcx-message__name is the author-name span inside each message header
  // and is the documented user-card trigger across the 6.x line. Fall
  // back to the avatar trigger if the name selector misses.
  const trigger = '.rcx-message__name, .rcx-message__user-card-trigger, .message-name';
  await page.waitForSelector(trigger, { timeout: 15_000 });
  await page.click(`${trigger}:first-of-type`);
  await page.waitForSelector('.rcx-user-card', { timeout: 8_000 });
}

async function navigateSurface(page: Page, spec: PointSpec): Promise<void> {
  const url = BASE_URL + SURFACE_PATH[spec.surface];
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
  // Meteor + React hybrid hydration settle. Same 800ms budget as Mattermost.
  await page.waitForTimeout(800);
  if (spec.surface === 'profile-modal') {
    await openProfileModal(page);
    await page.waitForTimeout(300);
  }
}

async function applyPrimitive(page: Page, spec: PointSpec): Promise<DefectRecord> {
  switch (spec.primitive) {
    case 'shift_element': {
      const p = spec.params ?? {};
      return PRIMITIVES.layout(page, spec.selector, p.dx as number, p.dy as number, {
        app: 'rocket-chat',
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
        { app: 'rocket-chat', defect_id: spec.id },
      );
    }
    case 'remove_element':
      return PRIMITIVES.missing(page, spec.selector, {
        app: 'rocket-chat',
        defect_id: spec.id,
      });
    case 'shrink_container': {
      const p = spec.params ?? {};
      return PRIMITIVES.truncation(
        page,
        spec.selector,
        (p.width_pct as number) ?? 0.6,
        { app: 'rocket-chat', defect_id: spec.id },
      );
    }
    case 'swap_zindex': {
      if (!spec.selector_b) throw new Error(`${spec.id}: swap_zindex needs selector_b`);
      return PRIMITIVES.zorder(page, spec.selector, spec.selector_b, {
        app: 'rocket-chat', defect_id: spec.id,
      });
    }
    case 'reduce_contrast': {
      const p = spec.params ?? {};
      return PRIMITIVES.contrast(
        page,
        spec.selector,
        (p.target_ratio as number) ?? 3.0,
        { app: 'rocket-chat', defect_id: spec.id },
      );
    }
    default:
      throw new Error(`${spec.id}: unknown primitive ${spec.primitive}`);
  }
}

async function runOne(
  category: DefectCategory,
  spec: PointSpec,
  alice: LoginPair | null,
  admin: LoginPair | null,
): Promise<{ baseline: string; defect: string; record: DefectRecord }> {
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    const need = SURFACE_LOGIN[spec.surface];
    if (need === 'alice') {
      if (!alice) throw new Error(`${spec.id}: surface needs alice login, no token`);
      await seedAuthStorage(ctx, alice);
    } else if (need === 'admin') {
      if (!admin) throw new Error(`${spec.id}: surface needs admin login, no token`);
      await seedAuthStorage(ctx, admin);
    }
    // For surface=login we deliberately keep the context unauthenticated.

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

  console.log('[smoke] verifying Rocket.Chat is up ...');
  await checkUp();

  console.log('[smoke] logging in as alice + admin (REST -> LocalStorage) ...');
  const alice = await apiLogin(ALICE_USER, ALICE_PASSWORD);
  const admin = await apiLogin(ADMIN_USER, ADMIN_PASSWORD);
  if (!alice) {
    console.warn('[smoke] WARN: alice login failed -- did you run ./apps/rocket-chat/seed.sh ?');
  } else {
    console.log('[smoke]   alice ok');
  }
  if (!admin) {
    console.warn('[smoke] WARN: admin login failed -- /admin surface will redirect to /home');
  } else {
    console.log('[smoke]   admin ok');
  }

  mkdirSync(OUT_DIR, { recursive: true });

  const results: Array<{ category: DefectCategory; baseline: string; defect: string; record: DefectRecord }> = [];
  for (const cat of ['layout', 'color', 'missing', 'truncation', 'zorder', 'contrast'] as DefectCategory[]) {
    const spec = picks[cat];
    console.log(`[smoke] running ${cat} via ${spec.primitive} on ${spec.surface} ${spec.selector}`);
    try {
      const r = await runOne(cat, spec, alice, admin);
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
