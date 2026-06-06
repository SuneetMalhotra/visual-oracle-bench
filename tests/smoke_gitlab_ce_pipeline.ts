// tests/smoke_gitlab_ce_pipeline.ts
//
// W4 smoke test: prove the injection -> capture pipeline works end-to-end
// on GitLab CE. Picks one defect per category from
// apps/gitlab-ce/injection-points.yaml, captures one baseline and one
// defect screenshot per category, writes 12 PNGs to data/images/gitlab-ce/.
//
// Pre-requisites (NOT performed by this script):
//   docker compose -f apps/gitlab-ce/docker-compose.yml up -d
//   # wait for /-/health (3-5 min cold start)
//   while ! curl -sf http://localhost:8080/-/health; do sleep 5; done
//   ./apps/gitlab-ce/seed.sh
//
// Run:
//   npx tsx tests/smoke_gitlab_ce_pipeline.ts
//
// Exits non-zero with a structured error on first failure; environmental
// failures (GitLab unreachable, login refused, selector not found) are
// reported with remediation hints, not silently swallowed.

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
const INJECTION_POINTS = resolve(REPO_ROOT, 'apps/gitlab-ce/injection-points.yaml');
const OUT_DIR = resolve(REPO_ROOT, 'data/images/gitlab-ce');
const BASE_URL = process.env.GITLAB_BASE_URL ?? 'http://localhost:8080';

const ROOT_USER = 'root';
const ROOT_PASSWORD = 'voracle-seed-Pa55word!';
const ALICE_USER = 'alice';
const ALICE_PASSWORD = 'voracle-seed-Pa55word!';

// Deep links for the 5 surfaces.
//   login    : unauthenticated; we DO NOT want the auto-redirect to /dashboard
//              on a session cookie, so we capture this page in a clean
//              context with no cookies.
//   project  : the engineering/oracle-bench-core project overview (seeded
//              by ./apps/gitlab-ce/seed.sh).
//   mr-list  : the project's merge_requests page; seed.sh creates one MR per
//              project so the list is not empty.
//   issue-view: the project's first issue (seeded with iid=1).
//   admin    : the admin overview landing page; requires root login.
const SURFACE_PATH: Record<string, string> = {
  login: '/users/sign_in',
  project: '/engineering/oracle-bench-core',
  'mr-list': '/engineering/oracle-bench-core/-/merge_requests',
  'issue-view': '/engineering/oracle-bench-core/-/issues/1',
  admin: '/admin',
};

// Which user (if any) must be logged in to render each surface correctly.
//   login: deliberately UNauthenticated (the page itself is what we capture).
//   project/mr-list/issue-view: any logged-in user; we use alice.
//   admin: root only.
const SURFACE_LOGIN: Record<string, 'none' | 'alice' | 'root'> = {
  login: 'none',
  project: 'alice',
  'mr-list': 'alice',
  'issue-view': 'alice',
  admin: 'root',
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
    const r = await fetch(`${BASE_URL}/-/health`);
    if (!r.ok) {
      throw new Error(`GitLab health at ${BASE_URL}/-/health returned ${r.status}`);
    }
  } catch (e) {
    throw new Error(
      `GitLab not reachable at ${BASE_URL}: ${(e as Error).message}\n` +
        `  -> Run: docker compose -f apps/gitlab-ce/docker-compose.yml up -d\n` +
        `  -> Wait: while ! curl -sf ${BASE_URL}/-/health; do sleep 5; done   (3-5 min cold)\n` +
        `  -> Then: ./apps/gitlab-ce/seed.sh`,
    );
  }
}

// Devise + Rails login is a 2-step dance: GET /users/sign_in to obtain the
// CSRF token, then POST /users/sign_in with username/password/authenticity_token.
// We drive this entirely inside a Playwright context so the resulting
// `_gitlab_session` cookie is automatically retained for subsequent
// navigation in the same context.
async function browserLogin(
  ctx: BrowserContext,
  username: string,
  password: string,
): Promise<boolean> {
  const page = await ctx.newPage();
  try {
    await page.goto(`${BASE_URL}/users/sign_in`, {
      waitUntil: 'networkidle',
      timeout: 30_000,
    });
    // Devise default field ids: user_login (username/email), user_password.
    await page.fill('#user_login', username);
    await page.fill('#user_password', password);
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30_000 }),
      page.click("button[type='submit'], input[type='submit'], .gl-button[type='submit']"),
    ]);
    // After a successful login we are redirected to /dashboard/projects
    // (regular user) or /dashboard or / (root). Anything OTHER than the
    // sign-in path indicates success.
    const url = page.url();
    return !url.includes('/users/sign_in');
  } catch {
    return false;
  } finally {
    await page.close();
  }
}

async function navigateSurface(page: Page, spec: PointSpec): Promise<void> {
  const url = BASE_URL + SURFACE_PATH[spec.surface];
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
  // Rails ERB renders synchronously, but Vue islands (admin dashboard
  // stats, MR list table, issue notes) hydrate asynchronously. 800ms is
  // the same settle budget Mattermost uses for React+Redux.
  await page.waitForTimeout(800);
}

async function applyPrimitive(page: Page, spec: PointSpec): Promise<DefectRecord> {
  switch (spec.primitive) {
    case 'shift_element': {
      const p = spec.params ?? {};
      return PRIMITIVES.layout(page, spec.selector, p.dx as number, p.dy as number, {
        app: 'gitlab-ce',
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
        { app: 'gitlab-ce', defect_id: spec.id },
      );
    }
    case 'remove_element':
      return PRIMITIVES.missing(page, spec.selector, {
        app: 'gitlab-ce',
        defect_id: spec.id,
      });
    case 'shrink_container': {
      const p = spec.params ?? {};
      return PRIMITIVES.truncation(
        page,
        spec.selector,
        (p.width_pct as number) ?? 0.6,
        { app: 'gitlab-ce', defect_id: spec.id },
      );
    }
    case 'swap_zindex': {
      if (!spec.selector_b) throw new Error(`${spec.id}: swap_zindex needs selector_b`);
      return PRIMITIVES.zorder(page, spec.selector, spec.selector_b, {
        app: 'gitlab-ce',
        defect_id: spec.id,
      });
    }
    case 'reduce_contrast': {
      const p = spec.params ?? {};
      return PRIMITIVES.contrast(
        page,
        spec.selector,
        (p.target_ratio as number) ?? 3.0,
        { app: 'gitlab-ce', defect_id: spec.id },
      );
    }
    default:
      throw new Error(`${spec.id}: unknown primitive ${spec.primitive}`);
  }
}

async function runOne(
  category: DefectCategory,
  spec: PointSpec,
  aliceLoggedIn: boolean,
  rootLoggedIn: boolean,
): Promise<{ baseline: string; defect: string; record: DefectRecord }> {
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    const need = SURFACE_LOGIN[spec.surface];
    // Each surface gets its own login (the `ctx` here is fresh per-surface).
    if (need === 'alice') {
      if (!aliceLoggedIn) throw new Error(`${spec.id}: surface needs alice login (sign_in upstream check failed)`);
      const ok = await browserLogin(ctx, ALICE_USER, ALICE_PASSWORD);
      if (!ok) throw new Error(`${spec.id}: alice login failed inside playwright context`);
    } else if (need === 'root') {
      if (!rootLoggedIn) throw new Error(`${spec.id}: surface needs root login (sign_in upstream check failed)`);
      const ok = await browserLogin(ctx, ROOT_USER, ROOT_PASSWORD);
      if (!ok) throw new Error(`${spec.id}: root login failed inside playwright context`);
    }
    // For surface=login we deliberately keep the context unauthenticated
    // so the sign_in page renders (rather than redirecting to /dashboard).

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

// Cheap upstream check: a one-off Playwright login per user so we can fail
// fast in main() if seed.sh has not been run or passwords don't match.
async function checkLoginUpstream(username: string, password: string): Promise<boolean> {
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({ viewport: VIEWPORT });
    const ok = await browserLogin(ctx, username, password);
    await ctx.close();
    return ok;
  } finally {
    await browser.close();
  }
}

async function main(): Promise<void> {
  console.log('[smoke] loading injection points ...');
  const file = loadPoints();
  const picks = pickOnePerCategory(file);

  console.log('[smoke] verifying GitLab CE is up ...');
  await checkUp();

  console.log('[smoke] verifying alice + root login upstream ...');
  const aliceOk = await checkLoginUpstream(ALICE_USER, ALICE_PASSWORD);
  const rootOk = await checkLoginUpstream(ROOT_USER, ROOT_PASSWORD);
  if (!aliceOk) {
    console.warn('[smoke] WARN: alice login failed -- did you run ./apps/gitlab-ce/seed.sh ?');
  } else {
    console.log('[smoke]   alice ok');
  }
  if (!rootOk) {
    console.warn('[smoke] WARN: root login failed -- /admin surface will redirect to /users/sign_in');
  } else {
    console.log('[smoke]   root ok');
  }

  mkdirSync(OUT_DIR, { recursive: true });

  const results: Array<{ category: DefectCategory; baseline: string; defect: string; record: DefectRecord }> = [];
  for (const cat of ['layout', 'color', 'missing', 'truncation', 'zorder', 'contrast'] as DefectCategory[]) {
    const spec = picks[cat];
    console.log(`[smoke] running ${cat} via ${spec.primitive} on ${spec.surface} ${spec.selector}`);
    try {
      const r = await runOne(cat, spec, aliceOk, rootOk);
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
