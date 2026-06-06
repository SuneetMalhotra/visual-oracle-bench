// visual-corpus/render.ts
//
// Boots a headless Chromium via Playwright, loads the local TodoMVC app via
// the file:// URL, applies each seeding from seedings.ts, and writes one
// 1280x800 PNG per case into visual-corpus/images/. Also writes a baseline.png
// from the unmodified app.
//
// Usage:
//   npx tsx visual-corpus/render.ts
//
// Requires `playwright` and the `chromium` browser binary (run
// `npx playwright install chromium` once after `npm install playwright`).

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { SEEDINGS } from './seedings.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const APP_INDEX = resolve(__dirname, 'app/index.html');
const IMG_DIR = resolve(__dirname, 'images');

const VIEWPORT = { width: 1280, height: 800 };

async function main(): Promise<void> {
  if (!existsSync(APP_INDEX)) {
    throw new Error('App index not found at ' + APP_INDEX);
  }
  mkdirSync(IMG_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const url = pathToFileURL(APP_INDEX).toString();

  // Baseline
  console.log('Rendering baseline.png');
  {
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(() => document.querySelectorAll('#todo-list li').length === 3);
    const buf = await page.screenshot({ type: 'png', fullPage: false });
    writeFileSync(resolve(IMG_DIR, 'baseline.png'), buf);
    await page.close();
  }

  for (const s of SEEDINGS) {
    console.log('Rendering ' + s.id + ' (' + s.type + ')');
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForFunction(() => document.querySelectorAll('#todo-list li').length === 3);

    if (s.css) {
      await page.addStyleTag({ content: s.css });
    }
    if (s.domScript) {
      // Pass the script body as a string and eval it in page context.
      await page.evaluate((src: string) => {
        // eslint-disable-next-line no-new-func
        new Function(src)();
      }, s.domScript);
    }
    // Give style/layout one frame to settle.
    await page.waitForTimeout(80);

    const buf = await page.screenshot({ type: 'png', fullPage: false });
    writeFileSync(resolve(IMG_DIR, s.id + '.png'), buf);
    await page.close();
  }

  await ctx.close();
  await browser.close();
  console.log('Done. Wrote ' + (SEEDINGS.length + 1) + ' images to ' + IMG_DIR);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
