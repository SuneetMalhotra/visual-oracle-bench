// tests/test_primitives_unit.ts
//
// Unit test for the 6 injection primitives. Runs each primitive against a
// self-contained synthetic HTML page (no Conduit dependency, no network)
// and asserts the expected post-condition. Exits non-zero on first failure.
//
// Run:
//   npx tsx tests/test_primitives_unit.ts
//
// This test is what proves primitives.ts is real (not a stub) without needing
// docker. The Conduit smoke test (smoke_conduit_pipeline.ts) proves the SAME
// primitives work against a real production-style web app.

import { chromium, Page } from 'playwright';
import {
  shift_element,
  mutate_color,
  remove_element,
  shrink_container,
  swap_zindex,
  reduce_contrast,
} from '../injection/primitives.js';

const HTML = `
<!doctype html>
<html><head><meta charset="utf-8"><title>primitive fixtures</title>
<style>
  body { font-family: sans-serif; background: #ffffff; margin: 0; padding: 24px; }
  #box1 { width: 200px; height: 100px; background: #336699; color: #ffffff;
          position: relative; z-index: 1; }
  #box2 { width: 200px; height: 100px; background: #66cc99; color: #000000;
          position: relative; z-index: 2; margin-top: -40px; margin-left: 40px; }
  #label { color: #ff0000; font-size: 16px; }
  #wide { width: 600px; overflow: visible; white-space: nowrap;
          color: #000000; background: #ffffff; }
  #killme { padding: 8px; background: #ffeb3b; }
  #lowcontrast { color: #000000; background: #ffffff; padding: 4px; }
</style></head>
<body>
  <div id="box1">box1</div>
  <div id="box2">box2</div>
  <p id="label">A red label.</p>
  <div id="wide">A long string that should overflow when the container is narrowed.</div>
  <button id="killme">remove me</button>
  <p id="lowcontrast">contrast walk target</p>
</body></html>
`;

const RESULTS: { name: string; ok: boolean; detail?: string }[] = [];

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function withPage<T>(fn: (p: Page) => Promise<T>): Promise<T> {
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    const page = await ctx.newPage();
    await page.setContent(HTML, { waitUntil: 'load' });
    return await fn(page);
  } finally {
    await browser.close();
  }
}

async function test_shift_element(): Promise<void> {
  await withPage(async (page) => {
    const before = await page.locator('#box1').boundingBox();
    assert(before, 'box1 has no bbox before');
    const rec = await shift_element(page, '#box1', 25, 10, { app: 'unit', defect_id: 'u-shift' });
    const after = await page.locator('#box1').boundingBox();
    assert(after, 'box1 has no bbox after');
    assert(Math.abs(after.x - (before.x + 25)) < 1, `x not shifted: ${before.x} -> ${after.x}`);
    assert(Math.abs(after.y - (before.y + 10)) < 1, `y not shifted: ${before.y} -> ${after.y}`);
    assert(rec.category === 'layout', 'category mismatch');
  });
}

async function test_mutate_color(): Promise<void> {
  await withPage(async (page) => {
    const before = await page.evaluate(() => getComputedStyle(document.querySelector('#label')!).color);
    const rec = await mutate_color(page, '#label', 'color', 120, { app: 'unit', defect_id: 'u-color' });
    const after = await page.evaluate(() => getComputedStyle(document.querySelector('#label')!).color);
    assert(after !== before, `color did not change: ${before}`);
    assert(rec.category === 'color', 'category mismatch');
  });
}

async function test_remove_element(): Promise<void> {
  await withPage(async (page) => {
    const present = await page.evaluate(() => !!document.querySelector('#killme'));
    assert(present, 'killme not present pre-removal');
    const rec = await remove_element(page, '#killme', { app: 'unit', defect_id: 'u-rm' });
    const gone = await page.evaluate(() => !document.querySelector('#killme'));
    assert(gone, 'killme not removed');
    assert(rec.category === 'missing', 'category mismatch');
  });
}

async function test_shrink_container(): Promise<void> {
  await withPage(async (page) => {
    const rec = await shrink_container(page, '#wide', 0.3, { app: 'unit', defect_id: 'u-trunc' });
    const overflowed = await page.evaluate(() => {
      const el = document.querySelector('#wide') as HTMLElement;
      return el.scrollWidth > el.clientWidth;
    });
    assert(overflowed, 'shrink did not produce overflow');
    const textOverflow = await page.evaluate(
      () => (document.querySelector('#wide') as HTMLElement).style.textOverflow,
    );
    assert(textOverflow === 'clip', `text-overflow should be clip, got "${textOverflow}"`);
    assert(rec.category === 'truncation', 'category mismatch');
  });
}

async function test_swap_zindex(): Promise<void> {
  await withPage(async (page) => {
    const before = await page.evaluate(() => ({
      a: getComputedStyle(document.querySelector('#box1')!).zIndex,
      b: getComputedStyle(document.querySelector('#box2')!).zIndex,
    }));
    const rec = await swap_zindex(page, '#box1', '#box2', { app: 'unit', defect_id: 'u-z' });
    const after = await page.evaluate(() => ({
      a: getComputedStyle(document.querySelector('#box1')!).zIndex,
      b: getComputedStyle(document.querySelector('#box2')!).zIndex,
    }));
    assert(after.a === before.b, `a should now be ${before.b}, got ${after.a}`);
    assert(after.b === before.a, `b should now be ${before.a}, got ${after.b}`);
    assert(rec.category === 'zorder', 'category mismatch');
  });
}

async function test_reduce_contrast(): Promise<void> {
  await withPage(async (page) => {
    const rec = await reduce_contrast(page, '#lowcontrast', 3.0, { app: 'unit', defect_id: 'u-contrast' });
    const after = rec.details.after_ratio as number;
    const before = rec.details.before_ratio as number;
    assert(after < before, `contrast did not drop: ${before} -> ${after}`);
    assert(after <= 3.5, `contrast not reduced enough: ${after}`);
    assert(rec.category === 'contrast', 'category mismatch');
  });
}

async function main(): Promise<void> {
  const tests: { name: string; fn: () => Promise<void> }[] = [
    { name: 'shift_element', fn: test_shift_element },
    { name: 'mutate_color', fn: test_mutate_color },
    { name: 'remove_element', fn: test_remove_element },
    { name: 'shrink_container', fn: test_shrink_container },
    { name: 'swap_zindex', fn: test_swap_zindex },
    { name: 'reduce_contrast', fn: test_reduce_contrast },
  ];
  for (const t of tests) {
    process.stdout.write(`[unit] ${t.name} ... `);
    try {
      await t.fn();
      RESULTS.push({ name: t.name, ok: true });
      console.log('ok');
    } catch (e) {
      RESULTS.push({ name: t.name, ok: false, detail: (e as Error).message });
      console.log('FAIL\n  ', (e as Error).message);
    }
  }
  const failed = RESULTS.filter((r) => !r.ok);
  console.log(`\n[unit] ${RESULTS.length - failed.length}/${RESULTS.length} passed`);
  if (failed.length > 0) process.exit(1);
}

main().catch((e) => {
  console.error('[unit] aborted:', e);
  process.exit(1);
});
