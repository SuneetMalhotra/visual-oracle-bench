// tests/smoke_cal-com_pipeline.ts
//
// W5 smoke test: prove the injection -> capture pipeline works end-to-end
// on Cal.com. Picks one defect per category from
// apps/cal-com/injection-points.yaml, captures one baseline and one defect
// screenshot per category, writes 12 PNGs to data/images/cal-com/.
//
// Pre-requisites (NOT performed by this script):
//   docker compose -f apps/cal-com/docker-compose.yml up --build -d
//   ./apps/cal-com/seed.sh
//
// Run:
//   npx tsx tests/smoke_cal-com_pipeline.ts

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
const INJECTION_POINTS = resolve(REPO_ROOT, 'apps/cal-com/injection-points.yaml');
const OUT_DIR = resolve(REPO_ROOT, 'data/images/cal-com');
const BASE_URL = process.env.CAL_BASE_URL ?? 'http://localhost:3001';

const ADMIN_EMAIL = 'admin@voracle.test';
const ADMIN_PASSWORD = 'voracle-seed-Pa55word!';

// Deep links for the 5 surfaces. All but `login` require an authed session.
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
  'booking-page': 'none', // booker flow is public
  'bookings-list': 'admin',
  'admin-settings': 'admin',
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
  return parseYaml(readFileSync(INJECTION_POINTS, 'utf8')) as InjectionFile;
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
    const r = await fetch(`${BASE_URL}/api/auth/session`);
    if (!r.ok) {
      throw new Error(`Cal.com at ${BASE_URL} returned ${r.status}`);
    }
  } catch (e) {
    throw new Error(
      `Cal.com not reachable at ${BASE_URL}: ${(e as Error).message}\n` +
        `  -> Run: docker compose -f apps/cal-com/docker-compose.yml up --build -d\n` +
        `  -> Then: ./apps/cal-com/seed.sh`,
    );
  }
}

// Log in via NextAuth credentials provider and harvest the
// next-auth.session-token cookie for replay into Playwright contexts.
async function apiLogin(): Promise<string | null> {
  try {
    // 1. Fetch CSRF token (NextAuth requires this for credentials POST).
    const csrfR = await fetch(`${BASE_URL}/api/auth/csrf`);
    if (!csrfR.ok) return null;
    const { csrfToken } = (await csrfR.json()) as { csrfToken: string };
    // Capture any cookies the csrf call set.
    const initialCookies: string[] = [];
    if (typeof csrfR.headers.getSetCookie === 'function') {
      for (const c of csrfR.headers.getSetCookie() as string[]) {
        const k = c.split(';')[0];
        if (k) initialCookies.push(k);
      }
    }
    // 2. POST credentials with CSRF + carry-over cookies.
    const body = new URLSearchParams({
      csrfToken,
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      callbackUrl: '/',
    });
    const r = await fetch(`${BASE_URL}/api/auth/callback/credentials`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(initialCookies.length ? { Cookie: initialCookies.join('; ') } : {}),
      },
      body: body.toString(),
      redirect: 'manual',
    });
    // Look for next-auth.session-token in Set-Cookie.
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

async function seedAuthCookie(ctx: BrowserContext, sessionToken: string): Promise<void> {
  const url = new URL(BASE_URL);
  await ctx.addCookies([
    {
      name: 'next-auth.session-token',
      value: sessionToken,
      domain: url.hostname,
      path: '/',
      httpOnly: true,
      secure: url.protocol === 'https:',
      sameSite: 'Lax',
    },
  ]);
}

async function navigateSurface(page: Page, spec: PointSpec): Promise<void> {
  const url = BASE_URL + SURFACE_PATH[spec.surface];
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
  // Next.js hydration settle. The booker page in particular needs
  // additional time for client-side time-slot fetch.
  await page.waitForTimeout(spec.surface === 'booking-page' ? 1_200 : 600);
}

async function applyPrimitive(page: Page, spec: PointSpec): Promise<DefectRecord> {
  switch (spec.primitive) {
    case 'shift_element': {
      const p = spec.params ?? {};
      return PRIMITIVES.layout(page, spec.selector, p.dx as number, p.dy as number, {
        app: 'cal-com',
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
        { app: 'cal-com', defect_id: spec.id },
      );
    }
    case 'remove_element':
      return PRIMITIVES.missing(page, spec.selector, {
        app: 'cal-com',
        defect_id: spec.id,
      });
    case 'shrink_container': {
      const p = spec.params ?? {};
      return PRIMITIVES.truncation(
        page,
        spec.selector,
        (p.width_pct as number) ?? 0.6,
        { app: 'cal-com', defect_id: spec.id },
      );
    }
    case 'swap_zindex': {
      if (!spec.selector_b) throw new Error(`${spec.id}: swap_zindex needs selector_b`);
      return PRIMITIVES.zorder(page, spec.selector, spec.selector_b, {
        app: 'cal-com', defect_id: spec.id,
      });
    }
    case 'reduce_contrast': {
      const p = spec.params ?? {};
      return PRIMITIVES.contrast(
        page,
        spec.selector,
        (p.target_ratio as number) ?? 3.0,
        { app: 'cal-com', defect_id: spec.id },
      );
    }
    default:
      throw new Error(`${spec.id}: unknown primitive ${spec.primitive}`);
  }
}

async function runOne(
  category: DefectCategory,
  spec: PointSpec,
  sessionToken: string | null,
): Promise<{ baseline: string; defect: string; record: DefectRecord }> {
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    const need = SURFACE_LOGIN[spec.surface];
    if (need === 'admin') {
      if (!sessionToken) throw new Error(`${spec.id}: surface needs admin login, no token`);
      await seedAuthCookie(ctx, sessionToken);
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

  console.log('[smoke] verifying Cal.com is up ...');
  await checkUp();

  console.log('[smoke] logging in as admin (NextAuth cookie) ...');
  const sessionToken = await apiLogin();
  if (!sessionToken) {
    console.warn(
      '[smoke] WARN: admin login failed -- did you run ./apps/cal-com/seed.sh ? ' +
        'event-types / bookings-list / admin-settings will redirect to /auth/login.',
    );
  } else {
    console.log('[smoke]   admin ok');
  }

  mkdirSync(OUT_DIR, { recursive: true });

  const results: Array<{ category: DefectCategory; baseline: string; defect: string; record: DefectRecord }> = [];
  for (const cat of ['layout', 'color', 'missing', 'truncation', 'zorder', 'contrast'] as DefectCategory[]) {
    const spec = picks[cat];
    console.log(`[smoke] running ${cat} via ${spec.primitive} on ${spec.surface} ${spec.selector}`);
    try {
      const r = await runOne(cat, spec, sessionToken);
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
