// tests/test_llm_judge_stubs.ts
//
// Provider-specific tests for the four LLM-as-judge wrappers, with NO real
// API calls. Validates:
//
//   1. Each wrapper constructs without an API key (no network at construction).
//   2. Calling .judge() WITHOUT the required env var raises a clear,
//      actionable error message -- not a silent failure, not an opaque
//      network exception.
//   3. cost_constants.computeCostUsd math is correct against known token counts.
//   4. parseVerdictJson handles the four shapes the dispatcher relies on:
//      well-formed JSON; code-fenced JSON; non-JSON; partial-JSON-missing-fields.
//   5. Ollama wrapper raises a clear ECONNREFUSED-style error if no Ollama is
//      reachable (or the request times out fast in this test environment).
//
// Run:
//   npx tsx tests/test_llm_judge_stubs.ts

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PRICING_GPT4O,
  PRICING_CLAUDE_SONNET_4_5,
  PRICING_GEMINI_2_5_PRO,
  PRICING_LLAMA_OLLAMA,
  computeCostUsd,
} from '../oracles/llm_judge/cost_constants.js';
import { parseVerdictJson } from '../oracles/llm_judge/types.js';
import { Gpt4oJudge } from '../oracles/llm_judge/gpt4o.js';
import { ClaudeJudge } from '../oracles/llm_judge/claude.js';
import { GeminiJudge } from '../oracles/llm_judge/gemini.js';
import { LlamaOllamaJudge } from '../oracles/llm_judge/llama_ollama.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SMOKE_DIR = resolve(__dirname, '..', 'data/images/_offline_smoke');
const FIXTURE_BASELINE = resolve(SMOKE_DIR, 'layout_baseline.png');
const FIXTURE_DEFECT = resolve(SMOKE_DIR, 'layout_defect.png');

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function expectThrowsWith(
  fn: () => Promise<unknown>,
  matcher: string | RegExp,
  label: string,
): Promise<void> {
  let err: Error | null = null;
  try {
    await fn();
  } catch (e) {
    err = e as Error;
  }
  assert(err, `${label}: expected error, got success`);
  const msg = err.message;
  const matches = typeof matcher === 'string' ? msg.includes(matcher) : matcher.test(msg);
  assert(
    matches,
    `${label}: error message ${JSON.stringify(msg)} does not match ${matcher.toString()}`,
  );
}

// ---------------------------------------------------------------------------
// 1. Cost math
// ---------------------------------------------------------------------------

async function test_cost_constants_math(): Promise<void> {
  // GPT-4o: 1M input + 1M output -> 2.50 + 10.00 = 12.50
  const c1 = computeCostUsd(PRICING_GPT4O, 1_000_000, 1_000_000);
  assert(Math.abs(c1 - 12.5) < 1e-9, `gpt4o cost: ${c1}`);
  // Claude Sonnet 4.5: 1M input + 1M output -> 3.00 + 15.00 = 18.00
  const c2 = computeCostUsd(PRICING_CLAUDE_SONNET_4_5, 1_000_000, 1_000_000);
  assert(Math.abs(c2 - 18.0) < 1e-9, `claude cost: ${c2}`);
  // Gemini 2.5 Pro: 1M input + 1M output -> 1.25 + 10.00 = 11.25
  const c3 = computeCostUsd(PRICING_GEMINI_2_5_PRO, 1_000_000, 1_000_000);
  assert(Math.abs(c3 - 11.25) < 1e-9, `gemini cost: ${c3}`);
  // Llama: always 0
  const c4 = computeCostUsd(PRICING_LLAMA_OLLAMA, 1_000_000, 1_000_000);
  assert(c4 === 0, `llama cost: ${c4}`);
  // Sub-1M math: 1500 input + 300 output on GPT-4o
  // = (1500/1e6)*2.5 + (300/1e6)*10 = 0.00375 + 0.003 = 0.00675
  const c5 = computeCostUsd(PRICING_GPT4O, 1500, 300);
  assert(Math.abs(c5 - 0.00675) < 1e-9, `gpt4o sub-call cost: ${c5}`);
}

// ---------------------------------------------------------------------------
// 2. parseVerdictJson shape coverage
// ---------------------------------------------------------------------------

async function test_parse_verdict_json_shapes(): Promise<void> {
  // Happy path
  const a = parseVerdictJson('{"verdict":"fail","rationale":"button obscured"}');
  assert(a.verdict === 'fail' && !a.malformed, `happy parse: ${JSON.stringify(a)}`);
  // Code-fenced (some models ignore "no fences" instruction)
  const b = parseVerdictJson('```json\n{"verdict":"pass","rationale":"all good"}\n```');
  assert(b.verdict === 'pass' && !b.malformed, `fenced parse: ${JSON.stringify(b)}`);
  // Non-JSON prose
  const c = parseVerdictJson('I think the image looks fine actually.');
  assert(c.malformed === true, `non-json should be malformed`);
  // JSON but missing required fields
  const d = parseVerdictJson('{"result":"ok"}');
  assert(d.malformed === true, `missing-fields should be malformed`);
  // JSON with wrong verdict value
  const e = parseVerdictJson('{"verdict":"maybe","rationale":"unsure"}');
  assert(e.malformed === true, `wrong-verdict should be malformed`);
}

// ---------------------------------------------------------------------------
// 3. Wrapper construction does not call the network
// ---------------------------------------------------------------------------

async function test_wrappers_construct_without_keys(): Promise<void> {
  // Save then clear env vars to ensure we test the no-key path.
  const savedOpenai = process.env.OPENAI_API_KEY;
  const savedAnthropic = process.env.ANTHROPIC_API_KEY;
  const savedGoogle = process.env.GOOGLE_API_KEY;
  const savedGemini = process.env.GEMINI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.GOOGLE_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    const opts = { promptText: 'constructor-test prompt' };
    const g = new Gpt4oJudge(opts);
    const c = new ClaudeJudge(opts);
    const gm = new GeminiJudge(opts);
    const l = new LlamaOllamaJudge(opts);
    assert(!g.isOperational(), 'gpt4o should NOT be operational without OPENAI_API_KEY');
    assert(!c.isOperational(), 'claude should NOT be operational without ANTHROPIC_API_KEY');
    assert(!gm.isOperational(), 'gemini should NOT be operational without GOOGLE/GEMINI_API_KEY');
    // Llama doesn't need a key, but does need a reachable Ollama; isOperational==true here
    // and the actual network attempt is gated separately.
    assert(l.isOperational(), 'llama wrapper isOperational should be true (key-free)');
  } finally {
    if (savedOpenai !== undefined) process.env.OPENAI_API_KEY = savedOpenai;
    if (savedAnthropic !== undefined) process.env.ANTHROPIC_API_KEY = savedAnthropic;
    if (savedGoogle !== undefined) process.env.GOOGLE_API_KEY = savedGoogle;
    if (savedGemini !== undefined) process.env.GEMINI_API_KEY = savedGemini;
  }
}

// ---------------------------------------------------------------------------
// 4. .judge() without required env var -> clear error (no silent failure)
// ---------------------------------------------------------------------------

async function test_judge_throws_clearly_without_api_keys(): Promise<void> {
  const savedOpenai = process.env.OPENAI_API_KEY;
  const savedAnthropic = process.env.ANTHROPIC_API_KEY;
  const savedGoogle = process.env.GOOGLE_API_KEY;
  const savedGemini = process.env.GEMINI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.GOOGLE_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    const opts = { promptText: 'no-key-test prompt' };
    const req = {
      baselinePath: FIXTURE_BASELINE,
      defectPath: FIXTURE_DEFECT,
      promptId: 'test',
      modelVersion: 'irrelevant',
    };
    await expectThrowsWith(
      () => new Gpt4oJudge(opts).judge(req),
      /OPENAI_API_KEY/,
      'gpt4o-no-key',
    );
    await expectThrowsWith(
      () => new ClaudeJudge(opts).judge(req),
      /ANTHROPIC_API_KEY/,
      'claude-no-key',
    );
    await expectThrowsWith(
      () => new GeminiJudge(opts).judge(req),
      /GOOGLE_API_KEY/,
      'gemini-no-key',
    );
  } finally {
    if (savedOpenai !== undefined) process.env.OPENAI_API_KEY = savedOpenai;
    if (savedAnthropic !== undefined) process.env.ANTHROPIC_API_KEY = savedAnthropic;
    if (savedGoogle !== undefined) process.env.GOOGLE_API_KEY = savedGoogle;
    if (savedGemini !== undefined) process.env.GEMINI_API_KEY = savedGemini;
  }
}

// ---------------------------------------------------------------------------
// 5. Llama wrapper -- unreachable Ollama -> clear ECONNREFUSED-style error
// ---------------------------------------------------------------------------

async function test_llama_unreachable_ollama_raises_clearly(): Promise<void> {
  // Point at a port that is almost certainly not bound.
  const l = new LlamaOllamaJudge({
    promptText: 'unreachable-test',
    baseUrl: 'http://127.0.0.1:65500',
    timeoutMs: 1500,
  });
  // ping() should return false quickly.
  const reachable = await l.ping();
  assert(!reachable, 'expected ping(:65500) to return false');
  // .judge() should throw with a clear hint, NOT silently return a stub result.
  await expectThrowsWith(
    () =>
      l.judge({
        baselinePath: FIXTURE_BASELINE,
        defectPath: FIXTURE_DEFECT,
        promptId: 'test',
        modelVersion: l.modelId,
      }),
    /(cannot reach Ollama|fetch failed|ECONNREFUSED|timed out)/,
    'llama-unreachable',
  );
}

// ---------------------------------------------------------------------------
// 6. Gemini snapshot pin honors env var (Decision A behavior)
// ---------------------------------------------------------------------------

async function test_gemini_snapshot_pin_from_env(): Promise<void> {
  const saved = process.env.GEMINI_MODEL_VERSION;
  process.env.GEMINI_MODEL_VERSION = 'gemini-2.5-pro-2026-04-15';
  try {
    const g = new GeminiJudge({ promptText: 'pin-test' });
    assert(
      g.modelId === 'gemini-2.5-pro-2026-04-15',
      `expected env-pinned modelId, got ${g.modelId}`,
    );
  } finally {
    if (saved === undefined) delete process.env.GEMINI_MODEL_VERSION;
    else process.env.GEMINI_MODEL_VERSION = saved;
  }
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

interface TestRow { name: string; ok: boolean; detail?: string; }

async function main(): Promise<void> {
  const tests: { name: string; fn: () => Promise<void> }[] = [
    { name: 'cost_constants_math', fn: test_cost_constants_math },
    { name: 'parse_verdict_json_shapes', fn: test_parse_verdict_json_shapes },
    { name: 'wrappers_construct_without_keys', fn: test_wrappers_construct_without_keys },
    { name: 'judge_throws_clearly_without_api_keys', fn: test_judge_throws_clearly_without_api_keys },
    { name: 'llama_unreachable_ollama_raises_clearly', fn: test_llama_unreachable_ollama_raises_clearly },
    { name: 'gemini_snapshot_pin_from_env', fn: test_gemini_snapshot_pin_from_env },
  ];
  const results: TestRow[] = [];
  for (const t of tests) {
    process.stdout.write(`[llm-stubs] ${t.name} ... `);
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
  console.log(`\n[llm-stubs] ${results.length - failed.length}/${results.length} passed`);
  if (failed.length > 0) process.exit(1);
}

main().catch((e) => {
  console.error('[llm-stubs] aborted:', e);
  process.exit(1);
});
