// scripts/offline_capture_pipeline.ts
//
// `--offline-pipeline` mode for scripts/capture_corpus.ts.
//
// Runs the full all-points capture loop end-to-end against a synthetic
// self-contained HTML fixture instead of the real docker stacks. The
// loop, the bounded-concurrency pump, the ledger writer, and the
// pairs-manifest pipeline all run for real -- the *only* difference from
// the real-app mode is that the page being screenshot is a fixed
// in-memory HTML page (no docker, no playwright nav across real apps).
//
// This is the W6 dry-but-real proof that the orchestrator works.
//
// What this is NOT: a replacement for the real 800-pair capture. The
// PNGs produced here are NOT the corpus the LLM judges will score; they
// are an end-to-end pipeline sanity-check that lets a reviewer confirm
// the orchestrator builds 50 baseline + 50 defect PNGs per app, writes
// a per-app ledger, and emits the cross-app pairs manifest -- without
// needing Docker, without needing API keys, without needing to wait
// hours.
//
// Per-app strategy:
//   - Read apps/<app>/injection-points.yaml verbatim (so the 50-point
//     count matches the real pre-registration).
//   - Drive Playwright against a self-contained HTML fixture that
//     exposes the 7 "universal stand-in" selectors below.
//   - REWRITE each PointSpec's `selector` (and `selector_b`) to point at
//     one of the universal stand-ins, chosen by category so the
//     primitive has a sensible target. The DefectRecord still carries
//     the ORIGINAL selector under details.original_selector so the
//     ledger reflects what the real-app capture would have done.
//
// The output structure exactly mirrors the real-capture output:
//   data/images/<app>/baseline/<id>.png
//   data/images/<app>/defect/<id>.png
//   data/images/<app>/_capture_ledger.json

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { findApp } from '../capture/drivers/index.js';
import {
  applyPrimitive,
  loadInjectionPoints,
  VIEWPORT,
  type CaptureLedger,
  type CaptureResult,
  type PointSpec,
} from '../capture/per_app.js';
import type { DefectRecord } from '../injection/primitives.js';

const FIXTURE_HTML = `
<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>voracle offline capture fixture</title>
<style>
  :root { --primary: #4f46e5; --bg: #f8fafc; --card: #ffffff; --text: #1e293b; --muted: #64748b; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, sans-serif;
         background: var(--bg); color: var(--text); }
  .surface-chrome { background: var(--primary); color: white; padding: 14px 28px;
                    display: flex; justify-content: space-between; position: relative; z-index: 10; }
  .surface-chrome .brand-label { font-weight: 700; font-size: 20px; }
  .surface-banner { background: #4f46e5; color: white; padding: 36px 28px; text-align: center;
                    position: relative; z-index: 5; }
  .surface-banner h1 { margin: 0; font-size: 36px; }
  .surface-container { max-width: 920px; margin: 24px auto; padding: 0 20px;
                       display: grid; grid-template-columns: 2fr 1fr; gap: 24px; }
  .surface-card { background: var(--card); border-radius: 8px; padding: 20px;
                  box-shadow: 0 1px 3px rgba(0,0,0,0.08); margin-bottom: 16px;
                  position: relative; z-index: 1; }
  .surface-card h2 { margin: 0 0 8px 0; font-size: 18px; color: var(--text); }
  .surface-card p  { margin: 0; color: var(--muted); font-size: 14px; }
  .surface-sidebar { background: var(--card); border-radius: 8px; padding: 16px;
                     position: relative; z-index: 1; }
  .surface-text { color: var(--muted); font-size: 13px; }
</style></head>
<body>
  <nav class="surface-chrome">
    <span class="brand-label">voracle</span>
    <div><a style="color:white" href="#">Surface action</a></div>
  </nav>
  <header class="surface-banner"><h1>Visual Oracle Bench</h1></header>
  <main class="surface-container">
    <section>
      <article class="surface-card">
        <h2>Article-equivalent stand-in</h2>
        <p>This article paragraph is wide enough to be a meaningful target for the truncation primitive at width_pct=0.6.</p>
      </article>
    </section>
    <aside class="surface-sidebar">
      <h2>Sidebar stand-in</h2>
      <p class="surface-text">Footnote / metadata stand-in for contrast primitive.</p>
    </aside>
  </main>
</body></html>
`;

const REWRITE_BY_CATEGORY: Record<string, { selector: string; selector_b?: string }> = {
  layout: { selector: '.surface-chrome .brand-label' },
  color: { selector: '.surface-card h2' },
  missing: { selector: '.surface-sidebar' },
  truncation: { selector: '.surface-card p' },
  zorder: { selector: '.surface-chrome', selector_b: '.surface-banner' },
  contrast: { selector: '.surface-text' },
};

// Selectors with opaque background, used when a color point asks for
// `backgroundColor` or `borderColor` mutation (the default `.surface-card h2`
// stand-in has a transparent background, which the mutate_color primitive
// (correctly) refuses to rotate).
const REWRITE_COLOR_BACKGROUND_SELECTOR = '.surface-chrome';
const REWRITE_COLOR_BORDER_SELECTOR = '.surface-banner';

function rewriteSpec(spec: PointSpec): PointSpec {
  const rw = REWRITE_BY_CATEGORY[spec.category];
  if (!rw) return spec;
  let selector = rw.selector;
  if (spec.category === 'color') {
    const prop = (spec.params?.prop as string | undefined) ?? 'color';
    if (prop === 'backgroundColor') selector = REWRITE_COLOR_BACKGROUND_SELECTOR;
    else if (prop === 'borderColor') selector = REWRITE_COLOR_BORDER_SELECTOR;
  }
  return {
    ...spec,
    selector,
    selector_b: rw.selector_b ?? spec.selector_b,
  };
}

async function captureAppOffline(
  app: string,
  repoRoot: string,
  concurrency: number,
): Promise<CaptureLedger> {
  const entry = findApp(app);
  const driver = entry.driver();
  const file = loadInjectionPoints(driver.injectionPointsPath, app);
  const points = file.points;
  console.log(`[offline-pipeline] === ${app}: ${points.length} points (concurrency=${concurrency}) ===`);

  mkdirSync(driver.outDir, { recursive: true });
  mkdirSync(resolve(driver.outDir, 'baseline'), { recursive: true });
  mkdirSync(resolve(driver.outDir, 'defect'), { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const results: CaptureResult[] = [];
  let okCount = 0;
  let failCount = 0;
  try {
    let next = 0;
    async function pump(): Promise<void> {
      while (true) {
        const idx = next++;
        if (idx >= points.length) return;
        const original = points[idx];
        const spec = rewriteSpec(original);
        const t0 = Date.now();
        const baselinePath = resolve(driver.outDir, 'baseline', `${spec.id}.png`);
        const defectPath = resolve(driver.outDir, 'defect', `${spec.id}.png`);
        let record: DefectRecord | null = null;
        let ok = false;
        let error: string | undefined;
        try {
          const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
          try {
            // BASELINE
            const basePage = await ctx.newPage();
            await basePage.setContent(FIXTURE_HTML, { waitUntil: 'load' });
            await basePage.screenshot({ path: baselinePath, type: 'png' });
            await basePage.close();
            // DEFECT
            const defectPage = await ctx.newPage();
            await defectPage.setContent(FIXTURE_HTML, { waitUntil: 'load' });
            record = await applyPrimitive(defectPage, spec, app);
            // Decorate the record with the ORIGINAL selector so the
            // ledger captures what the real-app capture would target.
            record = {
              ...record,
              details: {
                ...record.details,
                offline_rewrite_original_selector: original.selector,
                offline_rewrite_original_selector_b: original.selector_b ?? null,
                offline_rewrite_used_selector: spec.selector,
                offline_rewrite_used_selector_b: spec.selector_b ?? null,
              },
            };
            await defectPage.waitForTimeout(80);
            await defectPage.screenshot({ path: defectPath, type: 'png' });
            await defectPage.close();
            ok = true;
          } finally {
            await ctx.close();
          }
        } catch (e) {
          error = (e as Error).message;
        }
        results.push({
          defect_id: spec.id,
          category: spec.category,
          surface: original.surface,
          baseline: baselinePath,
          defect: defectPath,
          record,
          ok,
          error,
          duration_ms: Date.now() - t0,
        });
        if (ok) okCount++;
        else failCount++;
        if ((idx + 1) % 10 === 0 || idx === points.length - 1) {
          console.log(`[offline-pipeline] ${app} [${idx + 1}/${points.length}] ok=${okCount} fail=${failCount}`);
        }
      }
    }
    const pumps = Array(Math.min(concurrency, points.length))
      .fill(0)
      .map(() => pump());
    await Promise.all(pumps);
  } finally {
    await browser.close();
  }

  results.sort((a, b) => a.defect_id.localeCompare(b.defect_id));
  const ledger: CaptureLedger = {
    app,
    captured_at: new Date().toISOString(),
    viewport: VIEWPORT,
    base_url: 'offline-fixture (synthetic HTML, no docker)',
    total_points: points.length,
    ok_count: okCount,
    fail_count: failCount,
    results,
  };
  const ledgerPath = resolve(driver.outDir, '_capture_ledger.json');
  writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2));
  console.log(`[offline-pipeline] ${app} done: ${okCount}/${points.length} ok -> ${ledgerPath}`);
  return ledger;
}

export async function runOfflinePipeline(
  apps: string[],
  repoRoot: string,
  concurrency: number,
): Promise<void> {
  console.log(`[offline-pipeline] starting: apps=${apps.join(',')} (NO docker, NO real apps)`);
  const summaries: CaptureLedger[] = [];
  for (const app of apps) {
    const ledger = await captureAppOffline(app, repoRoot, concurrency);
    summaries.push(ledger);
  }
  const totalOk = summaries.reduce((s, l) => s + l.ok_count, 0);
  const totalPoints = summaries.reduce((s, l) => s + l.total_points, 0);
  const totalFail = summaries.reduce((s, l) => s + l.fail_count, 0);
  const summaryPath = resolve(repoRoot, 'data/images/_corpus_summary.json');
  mkdirSync(resolve(repoRoot, 'data/images'), { recursive: true });
  writeFileSync(
    summaryPath,
    JSON.stringify(
      {
        captured_at: new Date().toISOString(),
        mode: 'offline-pipeline',
        total_apps: summaries.length,
        total_points: totalPoints,
        total_ok: totalOk,
        total_fail: totalFail,
        per_app: summaries.map((l) => ({
          app: l.app,
          ok: l.ok_count,
          fail: l.fail_count,
          total: l.total_points,
          ledger: resolve(repoRoot, `data/images/${l.app}/_capture_ledger.json`),
        })),
        note:
          'OFFLINE PIPELINE MODE -- PNGs produced from a synthetic HTML fixture, ' +
          'NOT from the real docker-compose stacks. This run proves the ' +
          'iterate-all-points + ledger + pairs-manifest pipeline works ' +
          'end-to-end without Docker. For the real corpus, re-run capture_corpus.ts ' +
          'without --offline-pipeline.',
      },
      null,
      2,
    ),
  );
  console.log(
    `\n[offline-pipeline] complete: ${totalOk}/${totalPoints} ok across ${summaries.length} apps ` +
      `(failed=${totalFail}) -> ${summaryPath}`,
  );
}
