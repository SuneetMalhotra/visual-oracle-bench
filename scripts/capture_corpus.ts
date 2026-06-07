// scripts/capture_corpus.ts
//
// W6 corpus capture orchestrator.
//
// Iterates the 8 onboarded apps and produces 50 baseline + 50 defect PNGs
// per app (800 pairs total) plus a per-app capture ledger
// (data/images/<app>/_capture_ledger.json). Each pair corresponds to one
// row in apps/<app>/injection-points.yaml.
//
// Per-app workflow:
//   1. (optional) docker compose -f apps/<app>/docker-compose.yml up -d
//   2. (optional) seed (./apps/<app>/seed.sh OR npx tsx apps/<app>/seed.ts)
//   3. driver.healthcheck()  + driver.bootstrap()  (see capture/per_app.ts)
//   4. capture all 50 injection points (parallel within app, default
//      concurrency 4) and write data/images/<app>/{baseline,defect}/<id>.png
//   5. (optional) docker compose -f apps/<app>/docker-compose.yml down -v
//
// Per-app capture is sequential (apps share host:port assumptions, e.g.
// Cal.com + Rocket.Chat both default to localhost:3001), but capture
// WITHIN an app is parallel up to `--concurrency`.
//
// Modes:
//   --dry-run             Print the per-app plan but do NOT bring docker up
//                         or hit any app. Use this to confirm the per-app
//                         wiring (which apps are registered, which compose
//                         file each maps to, what seed command, what
//                         injection-points file, expected point count).
//                         Exits 0 if every app yaml parses + every driver
//                         module imports cleanly.
//
//   --offline-pipeline    Drive the FULL capture-loop end-to-end against
//                         the offline synthetic-HTML fixture (the same
//                         fixture tests/smoke_offline_pipeline.ts uses).
//                         This produces real PNGs and a real ledger
//                         without needing docker, and proves the
//                         iterate-50-per-app + ledger pipeline works.
//                         Each app's points file is rewritten in-memory
//                         to point at the synthetic fixture's stable
//                         selectors.
//
//   --apps a,b,c          Restrict to a comma-separated subset of apps
//                         (default: all 8). Useful for partial sessions.
//
//   --assume-running      Skip the `docker compose up` step (and the
//                         seed step) and assume each app's stack is
//                         already up. Used when running multiple capture
//                         passes against the same stack.
//
//   --keep-up             Skip the `docker compose down` teardown.
//
//   --concurrency N       Parallel captures per app (default 4).
//
// CLI:
//   npx tsx scripts/capture_corpus.ts --dry-run
//   npx tsx scripts/capture_corpus.ts --offline-pipeline
//   npx tsx scripts/capture_corpus.ts --apps conduit,mattermost
//   npx tsx scripts/capture_corpus.ts --apps conduit --assume-running

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { APPS, findApp } from '../capture/drivers/index.js';
import { captureApp, loadInjectionPoints, type CaptureLedger } from '../capture/per_app.js';
import { runOfflinePipeline } from './offline_capture_pipeline.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');

interface Args {
  apps: string[];
  dryRun: boolean;
  offlinePipeline: boolean;
  assumeRunning: boolean;
  keepUp: boolean;
  concurrency: number;
}

function parseArgs(argv: string[]): Args {
  const out: Args = {
    apps: APPS.map((a) => a.app),
    dryRun: false,
    offlinePipeline: false,
    assumeRunning: false,
    keepUp: false,
    concurrency: 4,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--offline-pipeline') out.offlinePipeline = true;
    else if (a === '--assume-running') out.assumeRunning = true;
    else if (a === '--keep-up') out.keepUp = true;
    else if (a === '--apps') out.apps = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--concurrency') out.concurrency = Math.max(1, parseInt(argv[++i], 10));
    else if (a === '-h' || a === '--help') {
      printHelp();
      process.exit(0);
    } else {
      console.error(`unknown arg: ${a}`);
      printHelp();
      process.exit(2);
    }
  }
  return out;
}

function printHelp(): void {
  console.error(
    'usage: npx tsx scripts/capture_corpus.ts [options]\n' +
      '  --apps a,b,c        subset (default: all 8)\n' +
      '  --dry-run           print plan only; no docker, no capture\n' +
      '  --offline-pipeline  capture against synthetic HTML fixture (no docker)\n' +
      '  --assume-running    skip docker compose up + seed\n' +
      '  --keep-up           skip docker compose down\n' +
      '  --concurrency N     parallel captures per app (default 4)\n',
  );
}

function runCmd(cmd: string[], opts: { cwd: string }): Promise<void> {
  return new Promise((resolveP, rejectP) => {
    const [bin, ...rest] = cmd;
    const child = spawn(bin, rest, { cwd: opts.cwd, stdio: 'inherit' });
    child.on('exit', (code) => {
      if (code === 0) resolveP();
      else rejectP(new Error(`command ${cmd.join(' ')} exited ${code}`));
    });
    child.on('error', rejectP);
  });
}

async function dockerComposeUp(composeFile: string): Promise<void> {
  console.log(`[orchestrator] docker compose up -- ${composeFile}`);
  await runCmd(['docker', 'compose', '-f', composeFile, 'up', '--build', '-d'], { cwd: REPO_ROOT });
}

async function dockerComposeDown(composeFile: string): Promise<void> {
  console.log(`[orchestrator] docker compose down -v -- ${composeFile}`);
  try {
    await runCmd(['docker', 'compose', '-f', composeFile, 'down', '-v'], { cwd: REPO_ROOT });
  } catch (e) {
    console.warn(`[orchestrator] WARN: compose down failed: ${(e as Error).message}`);
  }
}

async function runSeed(seedCmd: string[]): Promise<void> {
  console.log(`[orchestrator] seed: ${seedCmd.join(' ')}`);
  await runCmd(seedCmd, { cwd: REPO_ROOT });
}

interface RunSummary {
  app: string;
  ok: number;
  fail: number;
  total: number;
  ledger?: string;
  error?: string;
}

async function realCaptureOne(
  app: string,
  args: Args,
): Promise<RunSummary> {
  const entry = findApp(app);
  const driver = entry.driver();
  const composeFile = resolve(REPO_ROOT, entry.composeFile);
  let broughtUp = false;
  try {
    if (!args.assumeRunning) {
      await dockerComposeUp(composeFile);
      broughtUp = true;
      await runSeed(entry.seedCmd);
    } else {
      console.log(`[orchestrator] --assume-running: skipping compose up + seed for ${app}`);
    }
    const ledger = await captureApp(driver, { concurrency: args.concurrency });
    return {
      app,
      ok: ledger.ok_count,
      fail: ledger.fail_count,
      total: ledger.total_points,
      ledger: resolve(driver.outDir, '_capture_ledger.json'),
    };
  } catch (e) {
    return { app, ok: 0, fail: 0, total: 0, error: (e as Error).message };
  } finally {
    if (broughtUp && !args.keepUp) {
      await dockerComposeDown(composeFile);
    }
  }
}

async function planDryRun(args: Args): Promise<void> {
  console.log('[orchestrator] --dry-run plan:');
  const summary: Array<{ app: string; points: number; categories: Record<string, number>; ok: boolean; reason?: string }> = [];
  for (const app of args.apps) {
    const entry = findApp(app);
    try {
      const driver = entry.driver();
      const file = loadInjectionPoints(driver.injectionPointsPath, app);
      const by: Record<string, number> = {};
      for (const p of file.points) by[p.category] = (by[p.category] ?? 0) + 1;
      summary.push({ app, points: file.points.length, categories: by, ok: true });
      console.log(
        `  ${app.padEnd(13)} compose=${entry.composeFile.padEnd(36)} ` +
          `seed='${entry.seedCmd.join(' ')}'  points=${file.points.length}  ` +
          `base=${driver.baseUrl}`,
      );
    } catch (e) {
      summary.push({ app, points: 0, categories: {}, ok: false, reason: (e as Error).message });
      console.log(`  ${app.padEnd(13)} ERROR: ${(e as Error).message}`);
    }
  }
  const totalPoints = summary.reduce((s, r) => s + r.points, 0);
  console.log(`[orchestrator] total injection points across selected apps: ${totalPoints}`);
  const planPath = resolve(REPO_ROOT, 'data/images/_dry_run_plan.json');
  mkdirSync(dirname(planPath), { recursive: true });
  writeFileSync(
    planPath,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        concurrency: args.concurrency,
        apps: summary,
        total_points: totalPoints,
        note:
          'This is a DRY-RUN plan. No docker stacks were brought up, no PNGs ' +
          'were captured. Run without --dry-run (and with Docker installed + ' +
          'subscriptions / Ollama vision available) to perform the actual ' +
          'capture.',
      },
      null,
      2,
    ),
  );
  console.log(`[orchestrator] plan written -> ${planPath}`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.dryRun) {
    await planDryRun(args);
    return;
  }

  if (args.offlinePipeline) {
    await runOfflinePipeline(args.apps, REPO_ROOT, args.concurrency);
    return;
  }

  console.log(`[orchestrator] real capture: apps=${args.apps.join(',')} concurrency=${args.concurrency}`);
  const results: RunSummary[] = [];
  for (const app of args.apps) {
    console.log(`\n[orchestrator] ============================== ${app} ==============================`);
    const r = await realCaptureOne(app, args);
    results.push(r);
    if (r.error) {
      console.error(`[orchestrator] ${app} ABORTED: ${r.error}`);
    } else {
      console.log(`[orchestrator] ${app} -> ${r.ok}/${r.total} ok, ${r.fail} fail`);
    }
  }

  // Cross-app summary ledger (data/images/_corpus_summary.json).
  const totalOk = results.reduce((s, r) => s + r.ok, 0);
  const totalFail = results.reduce((s, r) => s + r.fail, 0);
  const totalPoints = results.reduce((s, r) => s + r.total, 0);
  const summaryPath = resolve(REPO_ROOT, 'data/images/_corpus_summary.json');
  mkdirSync(dirname(summaryPath), { recursive: true });
  writeFileSync(
    summaryPath,
    JSON.stringify(
      {
        captured_at: new Date().toISOString(),
        total_apps: results.length,
        total_points: totalPoints,
        total_ok: totalOk,
        total_fail: totalFail,
        per_app: results,
      },
      null,
      2,
    ),
  );
  console.log(`\n[orchestrator] corpus summary: ${totalOk}/${totalPoints} ok across ${results.length} apps`);
  console.log(`[orchestrator] summary -> ${summaryPath}`);
  console.log(`[orchestrator] Next: npx tsx scripts/capture_pairs_manifest.ts`);

  if (totalFail > 0 || results.some((r) => r.error)) {
    process.exit(3);
  }
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((e) => {
    console.error('[orchestrator] fatal:', (e as Error).message);
    process.exit(1);
  });
}

export type { CaptureLedger };
