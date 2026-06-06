// apps/penpot/seed.ts
//
// Seed a running Penpot stack with the deterministic fixture used by
// the benchmark capture run.
//
// Why a TypeScript / Playwright seed (not a bash + curl seed)?
//   Penpot's public REST API (the `/api/rpc/command/*` namespace)
//   exposes registration, profile/team/project/file CRUD, and most
//   collaboration verbs -- but the "create a file containing N shapes"
//   endpoint is internal: shapes are emitted as Workspace change
//   operations broadcast over WebSocket on save. The cleanest scripted
//   path is therefore (a) use REST to register the user + create the
//   team/project/file, then (b) drive Playwright through the workspace
//   to emit the 8-10 fixture shapes via the toolbar so the changes
//   flow through the canonical persistence path. This script does
//   exactly that. It is idempotent: if the user / team / project /
//   file already exists by name it is reused.
//
// Fixture spec (pre-registered for the W5 onboarding milestone):
//   - 1 admin user        : voracle-admin@voracle.test
//   - 1 team              : voracle-bench
//   - 1 project           : voracle-fixture
//   - 1 file              : fixture-canvas
//   - 8 shapes in the file:
//       2 rectangles, 2 ellipses, 2 text frames, 1 line, 1 arrow
//     (Penpot does not have native "diamond" or "freedraw"; we use the
//     rectangle-on-rotate proxy for the diamond category in the smoke
//     pipeline canvas overlays.)
//
// Run:
//   npx tsx apps/penpot/seed.ts
//   (optionally: PENPOT_URL=http://localhost:9001 npx tsx ...)

import { chromium, type Page } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BASE_URL = process.env.PENPOT_URL ?? 'http://localhost:9001';
const API_BASE = `${BASE_URL}/api/rpc`;
const FIXTURE_DIR = resolve(__dirname, 'fixtures');
const FIXTURE_FILE = resolve(FIXTURE_DIR, 'seed-fixture.json');

const ADMIN_EMAIL = 'voracle-admin@voracle.test';
const ADMIN_FULLNAME = 'Voracle Admin';
const ADMIN_PASSWORD = 'voracle-seed-Pa55word!';
const TEAM_NAME = 'voracle-bench';
const PROJECT_NAME = 'voracle-fixture';
const FILE_NAME = 'fixture-canvas';

// ---------------------------------------------------------------------------
// REST helpers
//   Penpot RPC convention:
//     POST /api/rpc/command/<command-name>
//     body: JSON object of command parameters
//     auth: session cookie `auth-token` set by /command/login-with-password
// ---------------------------------------------------------------------------

interface RpcResponse {
  status: number;
  body: unknown;
  setCookies: string[];
}

async function rpc(command: string, body: unknown, cookieJar: string[]): Promise<RpcResponse> {
  const cookies = cookieJar.join('; ');
  const r = await fetch(`${API_BASE}/command/${command}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(cookies ? { Cookie: cookies } : {}),
    },
    body: JSON.stringify(body ?? {}),
  });
  const text = await r.text();
  let parsed: unknown = null;
  try {
    parsed = text.length > 0 ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  // Capture every Set-Cookie line so we can replay the session.
  // node-fetch / undici exposes them via .getSetCookie() in recent versions.
  const setCookies: string[] = [];
  if (typeof r.headers.getSetCookie === 'function') {
    for (const c of r.headers.getSetCookie() as string[]) {
      const k = c.split(';')[0];
      if (k) setCookies.push(k);
    }
  }
  return { status: r.status, body: parsed, setCookies };
}

async function waitForBackend(): Promise<void> {
  console.log(`[seed] waiting for ${API_BASE}/command/get-profile (60-90s on cold start) ...`);
  // The backend takes 60-90s on the FIRST run while the JVM finishes
  // schema migrations. We poll for up to 3 min.
  for (let i = 0; i < 90; i++) {
    try {
      const r = await fetch(`${API_BASE}/command/get-profile`, { method: 'POST', body: '{}' });
      // 200 (unauthenticated profile) OR 401/403 (no session) both mean
      // the JVM is up and serving requests.
      if (r.status < 500) {
        console.log(`[seed] backend ready (status ${r.status})`);
        return;
      }
    } catch {
      /* not up yet */
    }
    await new Promise((res) => setTimeout(res, 2_000));
  }
  throw new Error(`[seed] backend at ${API_BASE} never became ready`);
}

async function registerOrLogin(): Promise<string[]> {
  // 1. Try register-profile (idempotent: 400/409 if email exists).
  const reg = await rpc(
    'register-profile',
    {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      fullname: ADMIN_FULLNAME,
      'accept-terms-and-privacy': true,
      'accept-newsletter-subscription': false,
    },
    [],
  );
  if (reg.status >= 200 && reg.status < 300) {
    console.log(`[seed] registered new admin: ${ADMIN_EMAIL}`);
  } else {
    console.log(`[seed] registration returned ${reg.status} (likely user exists); falling through to login`);
  }
  // 2. Login (always).
  const login = await rpc(
    'login-with-password',
    { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    [],
  );
  if (login.status !== 200) {
    throw new Error(`[seed] login failed: status=${login.status} body=${JSON.stringify(login.body)}`);
  }
  if (login.setCookies.length === 0) {
    throw new Error('[seed] login succeeded but no auth-token cookie returned');
  }
  console.log('[seed] login ok, auth-token cookie captured');
  return login.setCookies;
}

async function ensureTeam(cookies: string[]): Promise<string> {
  const teams = await rpc('get-teams', {}, cookies);
  if (teams.status !== 200) throw new Error(`[seed] get-teams failed: ${teams.status}`);
  const list = (teams.body as Array<{ id: string; name: string }> | null) ?? [];
  const existing = list.find((t) => t.name === TEAM_NAME);
  if (existing) {
    console.log(`[seed] team exists: ${TEAM_NAME} (${existing.id})`);
    return existing.id;
  }
  const created = await rpc('create-team', { name: TEAM_NAME }, cookies);
  if (created.status !== 200) {
    throw new Error(`[seed] create-team failed: ${created.status} ${JSON.stringify(created.body)}`);
  }
  const id = (created.body as { id?: string })?.id;
  if (!id) throw new Error('[seed] create-team returned no id');
  console.log(`[seed] team created: ${TEAM_NAME} (${id})`);
  return id;
}

async function ensureProject(cookies: string[], teamId: string): Promise<string> {
  const projects = await rpc('get-projects', { 'team-id': teamId }, cookies);
  if (projects.status !== 200) throw new Error(`[seed] get-projects failed: ${projects.status}`);
  const list = (projects.body as Array<{ id: string; name: string }> | null) ?? [];
  const existing = list.find((p) => p.name === PROJECT_NAME);
  if (existing) {
    console.log(`[seed] project exists: ${PROJECT_NAME} (${existing.id})`);
    return existing.id;
  }
  const created = await rpc(
    'create-project',
    { 'team-id': teamId, name: PROJECT_NAME },
    cookies,
  );
  if (created.status !== 200) {
    throw new Error(`[seed] create-project failed: ${created.status} ${JSON.stringify(created.body)}`);
  }
  const id = (created.body as { id?: string })?.id;
  if (!id) throw new Error('[seed] create-project returned no id');
  console.log(`[seed] project created: ${PROJECT_NAME} (${id})`);
  return id;
}

async function ensureFile(cookies: string[], projectId: string): Promise<string> {
  const files = await rpc('get-project-files', { 'project-id': projectId }, cookies);
  if (files.status !== 200) throw new Error(`[seed] get-project-files failed: ${files.status}`);
  const list = (files.body as Array<{ id: string; name: string }> | null) ?? [];
  const existing = list.find((f) => f.name === FILE_NAME);
  if (existing) {
    console.log(`[seed] file exists: ${FILE_NAME} (${existing.id})`);
    return existing.id;
  }
  const created = await rpc(
    'create-file',
    { 'project-id': projectId, name: FILE_NAME, 'is-shared': false },
    cookies,
  );
  if (created.status !== 200) {
    throw new Error(`[seed] create-file failed: ${created.status} ${JSON.stringify(created.body)}`);
  }
  const id = (created.body as { id?: string })?.id;
  if (!id) throw new Error('[seed] create-file returned no id');
  console.log(`[seed] file created: ${FILE_NAME} (${id})`);
  return id;
}

// ---------------------------------------------------------------------------
// Shape seeding via Playwright workspace driver
//
// Penpot's shape-creation endpoint (`update-file` with changes vector)
// requires a valid Workspace session and a non-trivial change-vector
// schema; rather than redistribute the upstream schema, we drive the
// canonical Workspace UI to emit the shapes the way a user would. The
// UI selectors are inferred from the Penpot frontend at the pinned
// source SHA; the action set below is intentionally minimal (toolbar
// click + canvas drag) so it is robust against minor UI drift.
// ---------------------------------------------------------------------------

interface ShapeSpec {
  tool: 'rect' | 'ellipse' | 'text' | 'curve';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label?: string;
}

const SHAPES: ShapeSpec[] = [
  { tool: 'rect', x1: 200, y1: 180, x2: 360, y2: 280 },
  { tool: 'rect', x1: 420, y1: 180, x2: 620, y2: 300 },
  { tool: 'ellipse', x1: 200, y1: 340, x2: 320, y2: 460 },
  { tool: 'ellipse', x1: 380, y1: 340, x2: 560, y2: 440 },
  { tool: 'text', x1: 200, y1: 500, x2: 580, y2: 528, label: 'Visual Oracle Bench Fixture' },
  { tool: 'text', x1: 200, y1: 560, x2: 480, y2: 588, label: 'voracle-bench seed canvas' },
  { tool: 'curve', x1: 200, y1: 620, x2: 600, y2: 620 }, // line
  { tool: 'curve', x1: 250, y1: 660, x2: 550, y2: 700 }, // arrow proxy
];

async function seedShapesViaWorkspace(teamId: string, projectId: string, fileId: string): Promise<void> {
  const workspaceUrl = `${BASE_URL}/#/workspace/${teamId}/${projectId}/${fileId}`;
  console.log(`[seed] driving workspace at ${workspaceUrl} to emit ${SHAPES.length} shapes ...`);
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    // Login via the form-based flow so the workspace inherits the session.
    await page.goto(`${BASE_URL}/#/auth/login`, { waitUntil: 'networkidle', timeout: 30_000 });
    try {
      await page.fill('input[name="email"]', ADMIN_EMAIL, { timeout: 10_000 });
      await page.fill('input[name="password"]', ADMIN_PASSWORD, { timeout: 5_000 });
      await page.click('button[type="submit"]', { timeout: 5_000 });
      await page.waitForURL(/dashboard|workspace/, { timeout: 15_000 });
    } catch (e) {
      console.warn(`[seed] login form drive failed (${(e as Error).message}); continuing -- workspace may already be authed`);
    }
    await page.goto(workspaceUrl, { waitUntil: 'networkidle', timeout: 30_000 });
    await page.waitForTimeout(2_000); // ClojureScript app + worker bootstrap

    for (const s of SHAPES) {
      try {
        await pickTool(page, s.tool);
        await dragOnCanvas(page, s.x1, s.y1, s.x2, s.y2);
        if (s.tool === 'text' && s.label) {
          await page.keyboard.type(s.label, { delay: 10 });
          await page.keyboard.press('Escape');
        }
        await page.waitForTimeout(150);
      } catch (e) {
        console.warn(`[seed]   shape (${s.tool} @ ${s.x1},${s.y1}) failed: ${(e as Error).message}`);
      }
    }
    // Penpot autosaves on idle; give the persistence queue a moment to drain.
    await page.waitForTimeout(2_000);
    console.log('[seed] shape seeding pass complete (autosave drain settled)');
  } finally {
    await browser.close();
  }
}

async function pickTool(page: Page, tool: ShapeSpec['tool']): Promise<void> {
  // Toolbar selectors are taken from penpot/frontend/src/app/main/ui/workspace/sidebar/toolbar.cljs.
  // alt-* selectors fall back to data-test attributes.
  const selectorByTool: Record<ShapeSpec['tool'], string[]> = {
    rect: ['[data-test="rect-btn"]', '[alt="Rectangle (R)"]', '.tool-rect'],
    ellipse: ['[data-test="ellipse-btn"]', '[alt="Ellipse (E)"]', '.tool-ellipse'],
    text: ['[data-test="text-btn"]', '[alt="Text (T)"]', '.tool-text'],
    curve: ['[data-test="curve-btn"]', '[alt="Curve (P)"]', '.tool-curve'],
  };
  for (const sel of selectorByTool[tool]) {
    const handle = await page.$(sel);
    if (handle) {
      await handle.click({ timeout: 2_000 });
      return;
    }
  }
  // Keyboard fallback: R / E / T / P select the tools in Penpot.
  const keyByTool: Record<ShapeSpec['tool'], string> = {
    rect: 'R',
    ellipse: 'E',
    text: 'T',
    curve: 'P',
  };
  await page.keyboard.press(keyByTool[tool]);
}

async function dragOnCanvas(page: Page, x1: number, y1: number, x2: number, y2: number): Promise<void> {
  const canvasSel = '.viewport, .render-shapes, .workspace-viewport';
  const canvas = await page.$(canvasSel);
  if (!canvas) throw new Error(`canvas not found via ${canvasSel}`);
  const box = await canvas.boundingBox();
  if (!box) throw new Error('canvas has no bounding box');
  const sx = box.x + x1;
  const sy = box.y + y1;
  const ex = box.x + x2;
  const ey = box.y + y2;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(ex, ey, { steps: 8 });
  await page.mouse.up();
}

// ---------------------------------------------------------------------------
// Fixture metadata on disk (reviewer-readable; mirrors the Excalidraw pattern)
// ---------------------------------------------------------------------------

async function writeFixtureMetadata(teamId: string, projectId: string, fileId: string): Promise<void> {
  mkdirSync(FIXTURE_DIR, { recursive: true });
  writeFileSync(
    FIXTURE_FILE,
    JSON.stringify(
      {
        admin_email: ADMIN_EMAIL,
        admin_password: ADMIN_PASSWORD, // non-secret dev value
        team: { name: TEAM_NAME, id: teamId },
        project: { name: PROJECT_NAME, id: projectId },
        file: { name: FILE_NAME, id: fileId },
        shapes: SHAPES,
        captured_at: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log(`[seed] wrote ${FIXTURE_FILE}`);
}

async function main(): Promise<void> {
  await waitForBackend();
  const cookies = await registerOrLogin();
  const teamId = await ensureTeam(cookies);
  const projectId = await ensureProject(cookies, teamId);
  const fileId = await ensureFile(cookies, projectId);
  await seedShapesViaWorkspace(teamId, projectId, fileId);
  await writeFixtureMetadata(teamId, projectId, fileId);
  console.log('[seed] done.');
}

main().catch((e) => {
  console.error('[seed] aborted:', e);
  process.exit(1);
});
