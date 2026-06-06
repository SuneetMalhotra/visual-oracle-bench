// tests/smoke_offline_pipeline.ts
//
// Offline smoke test: same end-to-end shape as smoke_conduit_pipeline.ts
// (baseline + defect screenshots, one per category, 12 PNGs total) but runs
// against a self-contained synthetic HTML fixture instead of the Conduit
// container. Lets us prove the injection -> capture pipeline works even when
// docker is not available on the machine.
//
// Outputs to data/images/_offline_smoke/ (note the underscore prefix to
// distinguish from real app-specific corpus directories).
//
// Run: npx tsx tests/smoke_offline_pipeline.ts

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  shift_element,
  mutate_color,
  remove_element,
  shrink_container,
  swap_zindex,
  reduce_contrast,
  DefectRecord,
} from '../injection/primitives.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const REPO_ROOT = resolve(__dirname, '..');
const OUT_DIR = resolve(REPO_ROOT, 'data/images/_offline_smoke');

const VIEWPORT = { width: 1024, height: 720 };

// A small but realistic page so screenshots look like a real app screen.
const FIXTURE_HTML = `
<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>voracle offline smoke fixture</title>
<style>
  :root { --primary: #4f46e5; --bg: #f8fafc; --card: #ffffff; --text: #1e293b; --muted: #64748b; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, sans-serif;
         background: var(--bg); color: var(--text); }
  .navbar { background: var(--primary); color: white; padding: 14px 28px;
            display: flex; justify-content: space-between; position: relative; z-index: 10; }
  .navbar .brand { font-weight: 700; font-size: 20px; }
  .navbar a { color: white; margin-left: 16px; text-decoration: none; font-size: 14px; }
  .banner { background: #4f46e5; color: white;
            padding: 36px 28px; text-align: center; position: relative; z-index: 5; }
  .banner h1 { margin: 0 0 8px 0; font-size: 36px; }
  .banner p { margin: 0; opacity: 0.9; font-size: 16px; }
  .container { max-width: 920px; margin: 24px auto; padding: 0 20px;
               display: grid; grid-template-columns: 2fr 1fr; gap: 24px; }
  .card { background: var(--card); border-radius: 8px; padding: 20px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.08); margin-bottom: 16px;
          position: relative; z-index: 1; }
  .card h2 { margin: 0 0 8px 0; font-size: 18px; color: var(--text); }
  .card p  { margin: 0; color: var(--muted); font-size: 14px; }
  .sidebar { background: var(--card); border-radius: 8px; padding: 16px;
             position: relative; z-index: 1; }
  .sidebar h3 { margin: 0 0 12px 0; font-size: 14px; color: var(--muted);
                text-transform: uppercase; letter-spacing: 0.5px; }
  .tag { display: inline-block; background: #e2e8f0; color: var(--text);
         padding: 4px 10px; border-radius: 999px; font-size: 12px; margin: 0 6px 6px 0; }
  .btn { background: var(--primary); color: white; border: none;
         padding: 10px 18px; border-radius: 6px; cursor: pointer;
         font-size: 14px; font-weight: 600; }
  .footnote { color: #94a3b8; font-size: 12px; margin-top: 8px; }
</style></head>
<body>
  <nav class="navbar">
    <span class="brand">voracle</span>
    <div>
      <a href="#home">Home</a>
      <a href="#feed">Feed</a>
      <a href="#settings">Settings</a>
      <a href="#logout">Log out</a>
    </div>
  </nav>
  <header class="banner">
    <h1>Visual Oracle Bench</h1>
    <p>Multi-application empirical evaluation of LLM-as-judge visual regression</p>
  </header>
  <main class="container">
    <section>
      <article class="card" id="article-1">
        <h2>Beyond TodoMVC</h2>
        <p>A long article preview that will be used to demonstrate the truncation primitive when the container is shrunk to a fraction of its baseline width without text-overflow ellipsis.</p>
        <button class="btn" id="article-1-btn">Read more</button>
      </article>
      <article class="card" id="article-2">
        <h2>Seeded Defects 101</h2>
        <p>Layout, color, missing, truncation, zorder, contrast -- the six pre-registered categories for the 800-pair corpus.</p>
        <button class="btn" id="article-2-btn">Read more</button>
      </article>
    </section>
    <aside class="sidebar" id="sidebar">
      <h3>Popular tags</h3>
      <span class="tag">ai</span>
      <span class="tag">testing</span>
      <span class="tag">opensource</span>
      <span class="tag">longread</span>
      <span class="tag">demo</span>
      <p class="footnote" id="footnote">Tags are deterministic in the seeded fixture.</p>
    </aside>
  </main>
</body></html>
`;

interface Step {
  category: 'layout' | 'color' | 'missing' | 'truncation' | 'zorder' | 'contrast';
  label: string;
  run: (page: import('playwright').Page) => Promise<DefectRecord>;
}

const STEPS: Step[] = [
  {
    category: 'layout',
    label: 'shift_navbar_brand',
    run: (page) => shift_element(page, '.navbar .brand', 40, 0, { app: '_offline', defect_id: 'o-layout-1' }),
  },
  {
    category: 'color',
    label: 'hue_rotate_banner_bg',
    run: (page) =>
      mutate_color(page, '.banner', 'backgroundColor', 120, { app: '_offline', defect_id: 'o-color-1' }),
  },
  {
    category: 'missing',
    label: 'remove_sidebar',
    run: (page) => remove_element(page, '#sidebar', { app: '_offline', defect_id: 'o-missing-1' }),
  },
  {
    category: 'truncation',
    label: 'shrink_article1_p',
    run: (page) => shrink_container(page, '#article-1 p', 0.4, { app: '_offline', defect_id: 'o-trunc-1' }),
  },
  {
    category: 'zorder',
    label: 'swap_navbar_banner',
    run: (page) => swap_zindex(page, '.navbar', '.banner', { app: '_offline', defect_id: 'o-zorder-1' }),
  },
  {
    category: 'contrast',
    label: 'fade_footnote',
    run: (page) => reduce_contrast(page, '#footnote', 2.0, { app: '_offline', defect_id: 'o-contrast-1' }),
  },
];

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({ viewport: VIEWPORT });
    const ledger: Array<{ category: string; baseline: string; defect: string; record: DefectRecord }> = [];

    for (const step of STEPS) {
      // BASELINE
      const basePage = await ctx.newPage();
      await basePage.setContent(FIXTURE_HTML, { waitUntil: 'load' });
      const baselineFile = resolve(OUT_DIR, `${step.category}_baseline.png`);
      await basePage.screenshot({ path: baselineFile, type: 'png' });
      await basePage.close();

      // DEFECT
      const defectPage = await ctx.newPage();
      await defectPage.setContent(FIXTURE_HTML, { waitUntil: 'load' });
      const record = await step.run(defectPage);
      await defectPage.waitForTimeout(80);
      const defectFile = resolve(OUT_DIR, `${step.category}_defect.png`);
      await defectPage.screenshot({ path: defectFile, type: 'png' });
      await defectPage.close();

      ledger.push({ category: step.category, baseline: baselineFile, defect: defectFile, record });
      console.log(`[offline-smoke] ${step.category}: ${step.label}  ok`);
    }

    writeFileSync(
      resolve(OUT_DIR, '_offline_smoke_ledger.json'),
      JSON.stringify(
        {
          captured_at: new Date().toISOString(),
          viewport: VIEWPORT,
          fixture: 'self-contained HTML (no docker, no Conduit)',
          note:
            'These 12 PNGs prove the injection -> capture pipeline works end-to-end. ' +
            'When docker is available, run tests/smoke_conduit_pipeline.ts to get the ' +
            'real Conduit equivalent in data/images/conduit/.',
          results: ledger,
        },
        null,
        2,
      ),
    );
    console.log(`[offline-smoke] done. 12 PNGs + ledger -> ${OUT_DIR}`);
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error('[offline-smoke] aborted:', e);
  process.exit(1);
});
