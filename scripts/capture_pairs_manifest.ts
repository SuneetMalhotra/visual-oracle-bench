// scripts/capture_pairs_manifest.ts
//
// W6 deliverable 2/4: after scripts/capture_corpus.ts has produced the
// per-app data/images/<app>/_capture_ledger.json files, this script
// aggregates them into a single data/images/_pairs_manifest.json that
// the LLM-judge dispatcher consumes as its --pairs argument.
//
// Output format matches what oracles/llm_judge/dispatcher.ts expects
// (see PairManifestEntry there):
//   {
//     "version": 1,
//     "generated_at": ISO8601,
//     "total_pairs": N,
//     "results": [ { app, defect_id, category, baseline, defect }, ... ]
//   }
//
// The dispatcher will accept this verbatim (it reads `results[]` and
// pulls `baseline`, `defect`, `category` from each entry).
//
// Usage:
//   npx tsx scripts/capture_pairs_manifest.ts
//   npx tsx scripts/capture_pairs_manifest.ts --apps conduit,mattermost
//   npx tsx scripts/capture_pairs_manifest.ts --out data/images/_pairs_manifest.json
//   npx tsx scripts/capture_pairs_manifest.ts --include-failed
//
// By default, only ledger entries with `ok: true` are emitted. Pass
// --include-failed to write a manifest that includes failed captures
// (useful for debugging which selectors miss in a particular run; the
// dispatcher will skip-or-fail on the bad rows since the PNG files won't
// exist).

import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { APPS } from '../capture/drivers/index.js';
import type { CaptureLedger, CaptureResult } from '../capture/per_app.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');

interface ManifestEntry {
  app: string;
  defect_id: string;
  category: string;
  surface: string;
  baseline: string;
  defect: string;
}

interface Args {
  apps: string[];
  outPath: string;
  includeFailed: boolean;
}

function parseArgs(argv: string[]): Args {
  const out: Args = {
    apps: APPS.map((a) => a.app),
    outPath: resolve(REPO_ROOT, 'data/images/_pairs_manifest.json'),
    includeFailed: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apps') out.apps = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--out') out.outPath = resolve(argv[++i]);
    else if (a === '--include-failed') out.includeFailed = true;
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
    'usage: npx tsx scripts/capture_pairs_manifest.ts [options]\n' +
      '  --apps a,b,c        subset (default: all 8)\n' +
      '  --out <path>        manifest path (default: data/images/_pairs_manifest.json)\n' +
      '  --include-failed    include ok:false rows (default: skip)\n',
  );
}

function readLedger(app: string): CaptureLedger | null {
  const path = resolve(REPO_ROOT, `data/images/${app}/_capture_ledger.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8')) as CaptureLedger;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const entries: ManifestEntry[] = [];
  const perAppCounts: Array<{ app: string; ok: number; included: number; fail: number; missing: boolean }> = [];
  let totalConsidered = 0;
  let totalIncluded = 0;
  let missingLedgers = 0;

  for (const app of args.apps) {
    const ledger = readLedger(app);
    if (!ledger) {
      console.warn(
        `[manifest] WARN: ${app}: data/images/${app}/_capture_ledger.json not found ` +
          `(run capture_corpus.ts first)`,
      );
      perAppCounts.push({ app, ok: 0, included: 0, fail: 0, missing: true });
      missingLedgers++;
      continue;
    }
    let included = 0;
    for (const r of ledger.results as CaptureResult[]) {
      totalConsidered++;
      if (!r.ok && !args.includeFailed) continue;
      entries.push({
        app,
        defect_id: r.defect_id,
        category: r.category,
        surface: r.surface,
        baseline: r.baseline,
        defect: r.defect,
      });
      included++;
      totalIncluded++;
    }
    perAppCounts.push({
      app,
      ok: ledger.ok_count,
      included,
      fail: ledger.fail_count,
      missing: false,
    });
  }

  // Stable order across apps for reproducible dispatcher input.
  entries.sort((a, b) => {
    if (a.app !== b.app) return a.app.localeCompare(b.app);
    return a.defect_id.localeCompare(b.defect_id);
  });

  const manifest = {
    version: 1,
    generated_at: new Date().toISOString(),
    total_apps: args.apps.length,
    total_pairs: entries.length,
    per_app: perAppCounts,
    include_failed: args.includeFailed,
    pre_registration_target_pairs: 400,
    pre_registration_target_pngs: 800,
    results: entries,
  };

  mkdirSync(dirname(args.outPath), { recursive: true });
  writeFileSync(args.outPath, JSON.stringify(manifest, null, 2));
  console.log(
    `[manifest] wrote ${entries.length} pairs (considered=${totalConsidered}, ` +
      `missing_ledgers=${missingLedgers}) -> ${args.outPath}`,
  );
  for (const r of perAppCounts) {
    if (r.missing) {
      console.log(`  ${r.app.padEnd(13)} MISSING ledger`);
    } else {
      console.log(`  ${r.app.padEnd(13)} ok=${r.ok} included=${r.included} fail=${r.fail}`);
    }
  }
  if (entries.length === 0) {
    console.error(
      `[manifest] no pairs included. Run capture_corpus.ts first (use --offline-pipeline ` +
        `to produce a pipeline-only proof without Docker).`,
    );
    process.exit(2);
  }
  // Pre-reg §4.5: 400 (baseline,defect) pairs = 800 PNGs across 8 apps × 50
  // injection points/app. (The pre-reg's "800 image pairs" figure is the
  // 2-viewport doubling; the single-viewport-per-pair total is 400.)
  if (entries.length < 400 && missingLedgers === 0 && !args.includeFailed) {
    console.warn(
      `[manifest] NOTE: ${entries.length} pairs < pre-registered 400 (8 apps × 50 points). ` +
        `Some captures failed (see per-app fail counts above) or you ran a subset.`,
    );
  }
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  try {
    main();
  } catch (e) {
    console.error('[manifest] fatal:', (e as Error).message);
    process.exit(1);
  }
}
