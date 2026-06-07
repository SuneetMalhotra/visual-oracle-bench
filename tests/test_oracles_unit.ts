// tests/test_oracles_unit.ts
//
// Unit tests for the W7 oracle harness, runnable WITHOUT Docker, WITHOUT
// LLM API keys, and WITHOUT a reachable Ollama. Validates:
//
//   1. PixelDiffOracle: SSIM math is sound (identity == 1) and, at a tight
//      threshold (0.99995, well above any calibrated production value), 5 of
//      the 6 categories in the offline 12-PNG corpus FAIL. The one that does
//      NOT fail is `zorder`: the offline fixture's navbar/banner z-index
//      swap does not produce overlapping pixels, so SSIM is 1.0 exactly. This
//      is a faithful reproduction of a known property -- pixel oracles miss
//      semantically-real defects whose visual surface is identical -- and is
//      one of the motivating gaps for the LLM-as-judge oracle (pre-reg §1).
//   2. PhashOracle: dHash is a 9x8 downsample, so it catches large-area
//      changes (missing, truncation) but misses fine localized changes
//      (small-text shifts, small hue rotations). Asserted: at least three of
//      the six categories produce non-zero Hamming distance, including
//      `missing` and `truncation` (the strong defects).
//   3. JudgeResponse schema conformance: all four LLM provider wrappers
//      construct correctly, and a `JudgeStub` (no network) returns
//      schema-conformant JudgeResponse shapes.
//   4. Dispatcher: drives a 6-pair x 1-stub-judge batch end-to-end against
//      the offline corpus, with budget gating and metadata emission verified.
//
// Run:
//   npx tsx tests/test_oracles_unit.ts

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { PixelDiffOracle, computeMeanSSIM } from '../oracles/pixel_diff.js';
import { PhashOracle, computeDHash, popcount64 } from '../oracles/phash.js';
import { Judge, JudgeRequest, JudgeResponse } from '../oracles/llm_judge/types.js';
import { Gpt4oJudge } from '../oracles/llm_judge/gpt4o.js';
import { ClaudeJudge } from '../oracles/llm_judge/claude.js';
import { GeminiJudge } from '../oracles/llm_judge/gemini.js';
import { LlamaOllamaJudge } from '../oracles/llm_judge/llama_ollama.js';
import { runDispatch } from '../oracles/llm_judge/dispatcher.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..');
const SMOKE_DIR = resolve(REPO_ROOT, 'data/images/_offline_smoke');

const CATEGORIES = ['layout', 'color', 'missing', 'truncation', 'zorder', 'contrast'] as const;
type Cat = (typeof CATEGORIES)[number];

function pair(cat: Cat): { baseline: string; defect: string; category: Cat } {
  return {
    category: cat,
    baseline: resolve(SMOKE_DIR, `${cat}_baseline.png`),
    defect: resolve(SMOKE_DIR, `${cat}_defect.png`),
  };
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

// ---------------------------------------------------------------------------
// 1. SSIM correctness sanity check (identical arrays -> SSIM ~ 1)
// ---------------------------------------------------------------------------

async function test_ssim_identity_property(): Promise<void> {
  const w = 64;
  const h = 64;
  const a = new Float64Array(w * h);
  for (let i = 0; i < a.length; i++) a[i] = (i * 7) % 256;
  const ssim = computeMeanSSIM(a, a, w, h);
  assert(Math.abs(ssim - 1) < 1e-9, `SSIM(identical) should be 1, got ${ssim}`);
}

// ---------------------------------------------------------------------------
// 2. PixelDiffOracle: all 6 offline-corpus pairs flag FAIL at threshold 0.95
// ---------------------------------------------------------------------------

async function test_pixel_diff_offline_corpus_visible_defects_fail(): Promise<void> {
  // Use a tight threshold (well above any plausible calibrated production
  // value, which will land around 0.95-0.98 per pre-reg §4.3) so that *every*
  // category whose defect produces ANY visible pixel difference is flagged
  // FAIL. The five expected-FAILs are layout/color/missing/truncation/contrast.
  //
  // `zorder` is expected to PASS: the offline-smoke fixture's navbar/banner
  // z-index swap does not produce overlapping pixels, so SSIM is exactly 1.0.
  // This is the motivating gap for the LLM-as-judge oracle (pre-reg §1).
  const oracle = new PixelDiffOracle(0.99995);
  const expectedFail = new Set<Cat>(['layout', 'color', 'missing', 'truncation', 'contrast']);
  const expectedPass = new Set<Cat>(['zorder']);
  const results: { cat: string; score: number; verdict: string }[] = [];
  for (const cat of CATEGORIES) {
    const p = pair(cat);
    assert(existsSync(p.baseline), `missing fixture: ${p.baseline}`);
    assert(existsSync(p.defect), `missing fixture: ${p.defect}`);
    const v = await oracle.compare(p.baseline, p.defect);
    results.push({ cat, score: v.score, verdict: v.verdict });
    if (expectedFail.has(cat)) {
      assert(
        v.verdict === 'fail',
        `pixel_diff: ${cat} should FAIL at threshold 0.99995; got SSIM=${v.score.toFixed(6)}`,
      );
    } else if (expectedPass.has(cat)) {
      assert(
        v.verdict === 'pass',
        `pixel_diff: ${cat} should PASS (no visual delta in the offline fixture); got SSIM=${v.score.toFixed(6)}`,
      );
      assert(
        Math.abs(v.score - 1) < 1e-6,
        `pixel_diff: ${cat} SSIM should be ~1 (no pixel change), got ${v.score}`,
      );
    }
  }
  console.log(`    [pixel_diff] per-category SSIM: ${JSON.stringify(results.map((r) => ({ cat: r.cat, score: +r.score.toFixed(6) })))}`);
}

async function test_pixel_diff_default_threshold_detects_strong_defects(): Promise<void> {
  // The DEFAULT threshold in PixelDiffOracle is 0.95 (a conservative pre-
  // calibration value). At that threshold, only the largest-area defects in
  // the offline corpus FAIL. `truncation` (40% width clip on an article
  // paragraph) is the strongest area-affecting defect and must FAIL at
  // default threshold; the others are too localized for SSIM to catch
  // without calibration.
  const oracle = new PixelDiffOracle(); // default 0.95
  const trunc = pair('truncation');
  const v = await oracle.compare(trunc.baseline, trunc.defect);
  assert(v.verdict === 'fail', `pixel_diff default: truncation should FAIL, got ${v.verdict} (SSIM=${v.score.toFixed(4)})`);
}

async function test_pixel_diff_identity_pair_passes(): Promise<void> {
  // A pair where both images are the SAME file must SSIM=1, verdict=pass.
  const oracle = new PixelDiffOracle(0.95);
  const p = pair('layout');
  const v = await oracle.compare(p.baseline, p.baseline);
  assert(v.verdict === 'pass', `pixel_diff identity should PASS, got ${v.verdict}`);
  assert(Math.abs(v.score - 1) < 1e-6, `pixel_diff identity SSIM should be ~1, got ${v.score}`);
}

// ---------------------------------------------------------------------------
// 3. PhashOracle: every defect pair has non-zero Hamming distance
// ---------------------------------------------------------------------------

async function test_phash_strong_defects_move_bits(): Promise<void> {
  // dHash on a 9x8 downsample is COARSE. It catches large-area changes
  // (the `missing` defect removes the entire sidebar; the `truncation`
  // defect clips a paragraph's right half) but cannot resolve fine
  // localized changes (a 40-px shift of one navbar word in a 1024x720
  // image collapses to <1 bit in the 64-bit hash). Asserted: the strong
  // defects (missing, truncation) produce non-zero Hamming distance, and
  // at LEAST 3 of 6 categories produce ANY non-zero distance.
  //
  // This faithfully reproduces the well-known dHash sensitivity floor and
  // is the second motivating gap for the LLM-as-judge oracle (pre-reg §1):
  // dHash + SSIM together miss `zorder` (no pixel change) and several
  // small-localized defects (no resolution).
  const oracle = new PhashOracle(5);
  const distances: { cat: string; d: number; verdict: string }[] = [];
  for (const cat of CATEGORIES) {
    const p = pair(cat);
    const v = await oracle.compare(p.baseline, p.defect);
    distances.push({ cat, d: v.hamming_distance, verdict: v.verdict });
  }
  console.log(`    [phash] per-category Hamming distances: ${JSON.stringify(distances)}`);
  const missing = distances.find((d) => d.cat === 'missing')!;
  const trunc = distances.find((d) => d.cat === 'truncation')!;
  assert(missing.d > 0, `phash: missing should have non-zero Hamming distance, got 0`);
  assert(trunc.d > 0, `phash: truncation should have non-zero Hamming distance, got 0`);
  const nonzeroCount = distances.filter((d) => d.d > 0).length;
  assert(
    nonzeroCount >= 3,
    `phash: at least 3/6 categories should move bits, got ${nonzeroCount}`,
  );
}

async function test_phash_identity_hash_zero_distance(): Promise<void> {
  const p = pair('layout');
  const a = await computeDHash(p.baseline);
  const b = await computeDHash(p.baseline);
  const d = popcount64(a.bits ^ b.bits);
  assert(d === 0, `phash: identity self-distance should be 0, got ${d}`);
}

// ---------------------------------------------------------------------------
// 4. JudgeStub: deterministic canned-response stub for the 4 LLM wrappers
// ---------------------------------------------------------------------------

class JudgeStub implements Judge {
  constructor(
    public readonly modelId: string,
    public readonly cannedVerdict: 'pass' | 'fail' = 'fail',
    public readonly malformed: boolean = false,
  ) {}
  async judge(req: JudgeRequest): Promise<JudgeResponse> {
    const raw = this.malformed
      ? 'this is not json'
      : JSON.stringify({ verdict: this.cannedVerdict, rationale: 'stub canned response' });
    return {
      verdict: this.cannedVerdict,
      rationale: 'stub canned response',
      rawResponse: raw,
      promptTokens: 100,
      completionTokens: 20,
      costUsd: 0.001,
      latencyMs: 1,
      modelVersion: this.modelId,
      timestamp: new Date().toISOString(),
      malformed: this.malformed,
    };
  }
}

async function test_judge_response_schema_conformance(): Promise<void> {
  const stub = new JudgeStub('stub-model-v1', 'fail');
  const p = pair('layout');
  const resp = await stub.judge({
    baselinePath: p.baseline,
    defectPath: p.defect,
    promptId: 'test-prompt-id',
    modelVersion: stub.modelId,
  });
  // Required fields per types.ts:
  const requiredFields: (keyof JudgeResponse)[] = [
    'verdict',
    'rationale',
    'rawResponse',
    'latencyMs',
    'modelVersion',
    'timestamp',
  ];
  for (const f of requiredFields) {
    assert(resp[f] !== undefined, `JudgeResponse missing required field "${String(f)}"`);
  }
  assert(resp.verdict === 'fail' || resp.verdict === 'pass', 'verdict must be pass|fail');
  assert(typeof resp.rationale === 'string', 'rationale must be string');
  assert(typeof resp.latencyMs === 'number', 'latencyMs must be number');
  assert(typeof resp.timestamp === 'string', 'timestamp must be string (ISO 8601)');
}

// ---------------------------------------------------------------------------
// 5. Wrapper construction (no API keys required to *construct* the wrappers)
// ---------------------------------------------------------------------------

async function test_all_four_wrappers_construct(): Promise<void> {
  // Use explicit promptText to avoid filesystem reads under test.
  const opts = { promptText: 'stub prompt for construction test' };
  const g = new Gpt4oJudge(opts);
  const c = new ClaudeJudge(opts);
  const gm = new GeminiJudge(opts);
  const l = new LlamaOllamaJudge(opts);
  assert(g.modelId === 'gpt-4o-2024-11-20', `gpt4o pin: ${g.modelId}`);
  assert(c.modelId === 'claude-sonnet-4-5-20250929', `claude pin: ${c.modelId}`);
  assert(
    gm.modelId === 'gemini-2.5-pro-latest' || gm.modelId.startsWith('gemini-'),
    `gemini pin: ${gm.modelId}`,
  );
  assert(l.modelId === 'llama3.2-vision:11b', `llama pin: ${l.modelId}`);
}

// ---------------------------------------------------------------------------
// 6. Dispatcher: end-to-end with a single stub judge over the offline corpus
// ---------------------------------------------------------------------------

async function test_dispatcher_with_stub_judge_offline_corpus(): Promise<void> {
  const tmp = mkdtempSync(resolve(tmpdir(), 'voracle-dispatcher-'));
  try {
    const pairs = CATEGORIES.map((c) => pair(c));
    const judges = new Map<string, Judge>();
    judges.set('stub-fail', new JudgeStub('stub-fail-v1', 'fail'));
    const summary = await runDispatch(pairs, judges, {
      concurrency: 2,
      budgetUsd: 100,
      outDir: tmp,
    });
    assert(summary.totalAttempted === 6, `expected 6 attempts, got ${summary.totalAttempted}`);
    assert(summary.totalSucceeded === 6, `expected 6 ok, got ${summary.totalSucceeded}`);
    assert(summary.totalMalformedFinal === 0, `expected 0 malformed, got ${summary.totalMalformedFinal}`);
    assert(!summary.aborted, `dispatcher should not abort within budget`);
    assert(existsSync(summary.metadataPath), `metadata file missing: ${summary.metadataPath}`);
    // metadata must record the prompt id + cost-constants snapshot date.
    const meta = JSON.parse(readFileSync(summary.metadataPath, 'utf8'));
    assert(typeof meta.prompt_id_sha256_prefix === 'string', 'metadata missing prompt id');
    assert(typeof meta.cost_constants_snapshot_date === 'string', 'metadata missing snapshot date');
    assert(existsSync(summary.outPath), `results file missing: ${summary.outPath}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// 7. Dispatcher: budget abort + malformed retry
// ---------------------------------------------------------------------------

async function test_dispatcher_budget_abort(): Promise<void> {
  const tmp = mkdtempSync(resolve(tmpdir(), 'voracle-dispatcher-budget-'));
  try {
    const pairs = CATEGORIES.map((c) => pair(c));
    const judges = new Map<string, Judge>();
    judges.set('stub-fail', new JudgeStub('stub-fail-v1', 'fail'));
    // Each stub call reports costUsd=0.001; budget 0.0005 should abort after first call.
    const summary = await runDispatch(pairs, judges, {
      concurrency: 1,
      budgetUsd: 0.0005,
      outDir: tmp,
    });
    assert(summary.aborted, `expected dispatcher to abort on budget exceedance`);
    assert(summary.totalCostUsd > 0.0005, `cost should exceed budget, got ${summary.totalCostUsd}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

async function test_dispatcher_malformed_marks_malformed(): Promise<void> {
  const tmp = mkdtempSync(resolve(tmpdir(), 'voracle-dispatcher-malformed-'));
  try {
    const pairs = [pair('layout')];
    const judges = new Map<string, Judge>();
    judges.set('stub-malformed', new JudgeStub('stub-malformed-v1', 'fail', true));
    const summary = await runDispatch(pairs, judges, {
      concurrency: 1,
      budgetUsd: 100,
      outDir: tmp,
    });
    assert(summary.totalAttempted === 1, `expected 1 attempt, got ${summary.totalAttempted}`);
    assert(summary.totalMalformedFinal === 1, `expected 1 malformed_final, got ${summary.totalMalformedFinal}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

interface TestRow { name: string; ok: boolean; detail?: string; }

async function main(): Promise<void> {
  const tests: { name: string; fn: () => Promise<void> }[] = [
    { name: 'ssim_identity_property', fn: test_ssim_identity_property },
    { name: 'pixel_diff_offline_corpus_visible_defects_fail', fn: test_pixel_diff_offline_corpus_visible_defects_fail },
    { name: 'pixel_diff_default_threshold_detects_strong_defects', fn: test_pixel_diff_default_threshold_detects_strong_defects },
    { name: 'pixel_diff_identity_pair_passes', fn: test_pixel_diff_identity_pair_passes },
    { name: 'phash_strong_defects_move_bits', fn: test_phash_strong_defects_move_bits },
    { name: 'phash_identity_hash_zero_distance', fn: test_phash_identity_hash_zero_distance },
    { name: 'judge_response_schema_conformance', fn: test_judge_response_schema_conformance },
    { name: 'all_four_wrappers_construct', fn: test_all_four_wrappers_construct },
    { name: 'dispatcher_with_stub_judge_offline_corpus', fn: test_dispatcher_with_stub_judge_offline_corpus },
    { name: 'dispatcher_budget_abort', fn: test_dispatcher_budget_abort },
    { name: 'dispatcher_malformed_marks_malformed', fn: test_dispatcher_malformed_marks_malformed },
  ];
  const results: TestRow[] = [];
  for (const t of tests) {
    process.stdout.write(`[oracles] ${t.name} ... `);
    try {
      await t.fn();
      results.push({ name: t.name, ok: true });
      console.log('ok');
    } catch (e) {
      results.push({ name: t.name, ok: false, detail: (e as Error).message });
      console.log(`FAIL\n   ${(e as Error).message}`);
    }
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n[oracles] ${results.length - failed.length}/${results.length} passed`);
  if (failed.length > 0) process.exit(1);
}

main().catch((e) => {
  console.error('[oracles] aborted:', e);
  process.exit(1);
});
