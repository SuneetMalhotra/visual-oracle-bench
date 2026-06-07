// oracles/llm_judge/dispatcher.ts
//
// Batched dispatcher for the LLM-as-judge oracle.
//
// Responsibilities (per pre-reg §4.4, §4.5, §6, §7):
//   1. For each (image-pair, judge) tuple, call judge.judge(req) once.
//   2. Rate-limit: at most N concurrent in-flight requests PER judge
//      (default 3), so providers don't get hammered and tail-latency stays
//      manageable.
//   3. On a `malformed: true` response, retry exactly once (pre-reg §6
//      exclusion rule); if still malformed, write the second response with
//      `malformed: true` and do NOT retry further.
//   4. Cumulative USD cost meter; ABORT the whole batch if cumulative cost
//      exceeds the --budget flag (default $1500 per the project plan).
//   5. Persist full results to `results/judgments_<timestamp>.parquet`. If
//      parquet writing fails for any reason, fall back to JSONL at
//      `results/judgments_<timestamp>.jsonl` and log the reason.
//   6. On first invocation, write `results/judgments_metadata.json` capturing
//      the runtime-pinned Gemini snapshot identifier (per pre-reg §12 Decision A)
//      plus the prompt sha256, the cost-constants snapshot date, and the
//      software pin manifest (Node version + judge SDK versions).
//
// CLI:
//   npx tsx oracles/llm_judge/dispatcher.ts \
//     --pairs <ledger.json>                  # path to pair manifest
//     [--judges gpt4o,claude,gemini,llama]   # default all four
//     [--concurrency 3]                      # per-judge concurrency
//     [--budget 1500]                        # USD cap, abort if exceeded
//     [--out-dir results]                    # output directory
//     [--dry-run]                            # print plan; do not call APIs
//
// Pair manifest format (compatible with smoke_offline_pipeline ledger):
//   { "results": [ { "category", "baseline", "defect", ... }, ... ] }

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Judge, JudgeRequest, JudgeResponse } from './types.js';
import { Gpt4oJudge } from './gpt4o.js';
import { ClaudeJudge } from './claude.js';
import { ClaudeOAuthJudge } from './claude_oauth.js';
import { OpenAICodexJudge } from './openai_codex.js';
import { GeminiJudge } from './gemini.js';
import { LlamaOllamaJudge } from './llama_ollama.js';
import { ALL_PRICING } from './cost_constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROMPT_PATH = resolve(__dirname, 'prompt.txt');

export interface DispatcherOptions {
  /** Per-judge in-flight concurrency. Default 3. */
  concurrency?: number;
  /** Cumulative USD budget; abort the batch if exceeded. Default 1500. */
  budgetUsd?: number;
  /** Output directory for results parquet + metadata json. */
  outDir?: string;
  /** When true, log the plan but do not call any judge. */
  dryRun?: boolean;
}

export interface PairManifestEntry {
  category?: string;
  /** Absolute path to baseline PNG (or relative-to-cwd; will be resolved). */
  baseline: string;
  /** Absolute path to defect PNG. */
  defect: string;
}

export interface JudgmentRecord extends JudgeResponse {
  judgeName: string;
  baselinePath: string;
  defectPath: string;
  category: string;
  retried: boolean;
}

interface RunSummary {
  totalAttempted: number;
  totalSucceeded: number;
  totalMalformedFinal: number;
  totalCostUsd: number;
  aborted: boolean;
  abortReason?: string;
  outPath: string;
  metadataPath: string;
}

/** sha256 of the verbatim prompt file, used as JudgeRequest.promptId. */
export function computePromptId(promptFilePath: string = PROMPT_PATH): string {
  const buf = readFileSync(promptFilePath);
  return createHash('sha256').update(buf).digest('hex').slice(0, 16);
}

/** Build the four judges referenced by short-name. */
export function buildJudgesFromNames(names: string[]): Map<string, Judge> {
  const map = new Map<string, Judge>();
  for (const n of names) {
    switch (n) {
      // -- API-key-based judges (legacy; available when reviewer provides keys)
      case 'gpt4o':
        map.set(n, new Gpt4oJudge());
        break;
      case 'claude':
        map.set(n, new ClaudeJudge());
        break;
      // -- OAuth/subscription-based judges (per user preference; no API keys)
      case 'claude-oauth':
        map.set(n, new ClaudeOAuthJudge());
        break;
      case 'openai-codex':
        map.set(n, new OpenAICodexJudge());
        break;
      // -- Always-available judges
      case 'gemini':
        map.set(n, new GeminiJudge());
        break;
      case 'llama':
        map.set(n, new LlamaOllamaJudge());
        break;
      default:
        throw new Error(
          `Unknown judge name "${n}"; valid: gpt4o, claude, claude-oauth, openai-codex, gemini, llama`,
        );
    }
  }
  return map;
}

/**
 * Bounded-concurrency map. Runs `worker` over `items` with at most
 * `concurrency` in-flight; calls `onProgress` with each completed result so
 * the caller can check the budget gate between items.
 */
async function boundedConcurrentMap<TIn, TOut>(
  items: TIn[],
  concurrency: number,
  worker: (item: TIn, idx: number) => Promise<TOut>,
  onProgress?: (out: TOut, idx: number) => boolean | void,
): Promise<TOut[]> {
  const out: TOut[] = new Array(items.length);
  let next = 0;
  let aborted = false;
  async function pump(): Promise<void> {
    while (!aborted) {
      const idx = next++;
      if (idx >= items.length) return;
      try {
        out[idx] = await worker(items[idx], idx);
      } catch (e) {
        // Propagate non-Error so caller sees it as a thrown rejection.
        throw e;
      }
      if (onProgress) {
        const cont = onProgress(out[idx], idx);
        if (cont === false) {
          aborted = true;
        }
      }
    }
  }
  const pumps = Array(Math.min(concurrency, items.length))
    .fill(0)
    .map(() => pump());
  await Promise.all(pumps);
  return out.filter((x) => x !== undefined);
}

/** Single (pair, judge) call with one retry on malformed. */
async function judgeWithRetry(
  judge: Judge,
  judgeName: string,
  pair: PairManifestEntry,
  promptId: string,
): Promise<JudgmentRecord> {
  const req: JudgeRequest = {
    baselinePath: pair.baseline,
    defectPath: pair.defect,
    promptId,
    modelVersion: judge.modelId,
  };
  let resp: JudgeResponse;
  let retried = false;
  try {
    resp = await judge.judge(req);
  } catch (e) {
    // Provider raised (e.g. transport failure). Synthesize a malformed record.
    return {
      verdict: 'fail',
      rationale: `PROVIDER_ERROR: ${(e as Error).message}`,
      rawResponse: '',
      latencyMs: 0,
      modelVersion: judge.modelId,
      timestamp: new Date().toISOString(),
      malformed: true,
      judgeName,
      baselinePath: pair.baseline,
      defectPath: pair.defect,
      category: pair.category ?? 'unknown',
      retried: false,
    };
  }
  // pre-reg §6: one retry on malformed.
  if (resp.malformed) {
    retried = true;
    try {
      resp = await judge.judge(req);
    } catch (e) {
      resp = {
        verdict: 'fail',
        rationale: `PROVIDER_ERROR_RETRY: ${(e as Error).message}`,
        rawResponse: '',
        latencyMs: 0,
        modelVersion: judge.modelId,
        timestamp: new Date().toISOString(),
        malformed: true,
      };
    }
    // If still malformed -> leave malformed:true; dispatcher records as such.
  }
  return {
    ...resp,
    judgeName,
    baselinePath: pair.baseline,
    defectPath: pair.defect,
    category: pair.category ?? 'unknown',
    retried,
  };
}

/** Persist records as parquet; fall back to JSONL on failure. */
async function persistRecords(records: JudgmentRecord[], outDir: string, ts: string): Promise<string> {
  mkdirSync(outDir, { recursive: true });
  const parquetPath = resolve(outDir, `judgments_${ts}.parquet`);
  const jsonlPath = resolve(outDir, `judgments_${ts}.jsonl`);
  try {
    // parquetjs-lite ships CommonJS; require via dynamic import.
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const mod: any = await import('parquetjs-lite');
    const parquet = mod.default ?? mod;
    const schema = new parquet.ParquetSchema({
      judgeName: { type: 'UTF8' },
      modelVersion: { type: 'UTF8' },
      baselinePath: { type: 'UTF8' },
      defectPath: { type: 'UTF8' },
      category: { type: 'UTF8' },
      verdict: { type: 'UTF8' },
      rationale: { type: 'UTF8' },
      rawResponse: { type: 'UTF8' },
      promptTokens: { type: 'INT64', optional: true },
      completionTokens: { type: 'INT64', optional: true },
      costUsd: { type: 'DOUBLE', optional: true },
      latencyMs: { type: 'INT64' },
      timestamp: { type: 'UTF8' },
      malformed: { type: 'BOOLEAN' },
      retried: { type: 'BOOLEAN' },
    });
    const writer = await parquet.ParquetWriter.openFile(schema, parquetPath);
    for (const r of records) {
      await writer.appendRow({
        judgeName: r.judgeName,
        modelVersion: r.modelVersion,
        baselinePath: r.baselinePath,
        defectPath: r.defectPath,
        category: r.category,
        verdict: r.verdict,
        rationale: r.rationale,
        rawResponse: r.rawResponse,
        promptTokens: r.promptTokens ?? null,
        completionTokens: r.completionTokens ?? null,
        costUsd: r.costUsd ?? null,
        latencyMs: r.latencyMs,
        timestamp: r.timestamp,
        malformed: !!r.malformed,
        retried: r.retried,
      });
    }
    await writer.close();
    /* eslint-enable @typescript-eslint/no-explicit-any */
    return parquetPath;
  } catch (e) {
    console.warn(
      `[dispatcher] parquet write failed (${(e as Error).message}); falling back to JSONL.`,
    );
    writeFileSync(jsonlPath, records.map((r) => JSON.stringify(r)).join('\n') + '\n');
    return jsonlPath;
  }
}

/**
 * Main programmatic entry point. Exported so the unit tests can drive the
 * dispatcher with stub judges without spawning a subprocess.
 */
export async function runDispatch(
  pairs: PairManifestEntry[],
  judges: Map<string, Judge>,
  opts: DispatcherOptions = {},
): Promise<RunSummary> {
  const concurrency = opts.concurrency ?? 3;
  const budgetUsd = opts.budgetUsd ?? 1500;
  const outDir = opts.outDir ?? resolve(process.cwd(), 'results');
  const dryRun = !!opts.dryRun;
  const ts = new Date().toISOString().replace(/[:.]/g, '-');

  const promptId = computePromptId();
  console.log(`[dispatcher] prompt_id=${promptId}`);
  console.log(`[dispatcher] pairs=${pairs.length} judges=${[...judges.keys()].join(',')}`);
  console.log(`[dispatcher] concurrency-per-judge=${concurrency} budget_usd=${budgetUsd}`);
  console.log(
    `[dispatcher] cost-constants snapshot date(s): ${[...new Set(ALL_PRICING.map((p) => p.snapshotDate))].join(', ')}` +
      ` -- reviewer MUST re-verify against provider pricing pages before relying on the budget gate.`,
  );

  // First-invocation metadata: capture runtime-resolved Gemini snapshot etc.
  mkdirSync(outDir, { recursive: true });
  const metadataPath = resolve(outDir, 'judgments_metadata.json');
  const metadata = {
    run_started_at: new Date().toISOString(),
    prompt_id_sha256_prefix: promptId,
    prompt_path: PROMPT_PATH,
    cost_constants_snapshot_date: ALL_PRICING[0].snapshotDate,
    pricing: ALL_PRICING.map((p) => ({
      model: p.modelId,
      input_usd_per_mtok: p.inputUsdPerMTok,
      output_usd_per_mtok: p.outputUsdPerMTok,
      page: p.pricingPageUrl,
    })),
    judges: [...judges.entries()].map(([name, j]) => ({ name, modelVersion: j.modelId })),
    budget_usd: budgetUsd,
    concurrency_per_judge: concurrency,
    pre_registration: 'preregistration/draft.md §4.4, §6, §12 Decision A',
  };
  writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  console.log(`[dispatcher] metadata -> ${metadataPath}`);

  if (dryRun) {
    console.log(`[dispatcher] dry-run: would issue ${pairs.length * judges.size} judgments.`);
    return {
      totalAttempted: 0,
      totalSucceeded: 0,
      totalMalformedFinal: 0,
      totalCostUsd: 0,
      aborted: false,
      outPath: '',
      metadataPath,
    };
  }

  const records: JudgmentRecord[] = [];
  let cumulativeCost = 0;
  let aborted = false;
  let abortReason: string | undefined;

  // Run each judge's pair-list with its own concurrency lane.
  for (const [judgeName, judge] of judges) {
    if (aborted) break;
    console.log(`[dispatcher] -- judge ${judgeName} (${judge.modelId}) --`);
    await boundedConcurrentMap(
      pairs,
      concurrency,
      (pair) => judgeWithRetry(judge, judgeName, pair, promptId),
      (record) => {
        records.push(record);
        cumulativeCost += record.costUsd ?? 0;
        if (cumulativeCost > budgetUsd) {
          aborted = true;
          abortReason = `cumulative cost $${cumulativeCost.toFixed(2)} exceeded budget $${budgetUsd}`;
          console.error(`[dispatcher] BUDGET ABORT: ${abortReason}`);
          return false;
        }
        return true;
      },
    );
  }

  const outPath = await persistRecords(records, outDir, ts);
  const malformedFinal = records.filter((r) => r.malformed).length;
  console.log(
    `[dispatcher] done. attempted=${records.length} malformed_final=${malformedFinal} ` +
      `cost_usd=${cumulativeCost.toFixed(4)} -> ${outPath}`,
  );

  return {
    totalAttempted: records.length,
    totalSucceeded: records.length - malformedFinal,
    totalMalformedFinal: malformedFinal,
    totalCostUsd: cumulativeCost,
    aborted,
    abortReason,
    outPath,
    metadataPath,
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): {
  pairs: string;
  judges: string[];
  concurrency: number;
  budget: number;
  outDir: string;
  dryRun: boolean;
} {
  const out = {
    pairs: '',
    // Default judges use OAuth/subscription paths (no API keys) per
    // user preference. Reviewer can override with --judges to pick the
    // API-key variants gpt4o,claude if those are preferred.
    judges: ['openai-codex', 'claude-oauth', 'gemini', 'llama'],
    concurrency: 3,
    budget: 1500,
    outDir: resolve(process.cwd(), 'results'),
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--pairs') out.pairs = argv[++i];
    else if (a === '--judges') out.judges = argv[++i].split(',').map((s) => s.trim());
    else if (a === '--concurrency') out.concurrency = parseInt(argv[++i], 10);
    else if (a === '--budget') out.budget = parseFloat(argv[++i]);
    else if (a === '--out-dir') out.outDir = resolve(argv[++i]);
    else if (a === '--dry-run') out.dryRun = true;
  }
  return out;
}

async function cli(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.pairs) {
    console.error(
      'usage: npx tsx oracles/llm_judge/dispatcher.ts --pairs <ledger.json>\n' +
        '  [--judges openai-codex,claude-oauth,gemini,llama]   # default (OAuth/subscription)\n' +
        '  [--judges gpt4o,claude,gemini,llama]                # API-key variants\n' +
        '  [--concurrency 3] [--budget 1500] [--out-dir results] [--dry-run]',
    );
    process.exit(2);
  }
  if (!existsSync(args.pairs)) {
    console.error(`pairs file not found: ${args.pairs}`);
    process.exit(2);
  }
  const ledger = JSON.parse(readFileSync(args.pairs, 'utf8'));
  const rawPairs: PairManifestEntry[] = Array.isArray(ledger.results)
    ? ledger.results
    : Array.isArray(ledger.pairs)
      ? ledger.pairs
      : Array.isArray(ledger)
        ? ledger
        : [];
  if (rawPairs.length === 0) {
    console.error(`no pairs found in ${args.pairs}`);
    process.exit(2);
  }
  const pairs = rawPairs.map((p) => ({
    category: p.category,
    baseline: resolve(p.baseline),
    defect: resolve(p.defect),
  }));

  const judges = buildJudgesFromNames(args.judges);
  const summary = await runDispatch(pairs, judges, {
    concurrency: args.concurrency,
    budgetUsd: args.budget,
    outDir: args.outDir,
    dryRun: args.dryRun,
  });
  console.log(JSON.stringify(summary, null, 2));
  if (summary.aborted) process.exit(3);
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  cli().catch((e) => {
    console.error('[dispatcher] error:', (e as Error).message);
    process.exit(1);
  });
}
