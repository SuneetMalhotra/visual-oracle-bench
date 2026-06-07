// oracles/llm_judge/types.ts
//
// Shared types for the four LLM-as-judge providers (GPT-4o, Claude Sonnet 4.5,
// Gemini 2.5 Pro, Llama 3.2 Vision via Ollama). Defined here so the dispatcher
// (`dispatcher.ts`) can hold a heterogeneous list of judges behind one
// interface and so the unit tests (`tests/test_llm_judge_stubs.ts`) can stub
// the providers without making network calls.
//
// Per pre-registration `§6 Exclusion rules`:
//   "Any LLM judgment where the response is malformed (does not produce
//    parseable single-line JSON with `verdict` field after one retry) is
//    recorded as 'malformed' and treated as missing data."
// -> the `malformed: true` flag on JudgeResponse implements this contract.

export interface JudgeRequest {
  /** Absolute path to the baseline (clean) PNG. */
  baselinePath: string;
  /** Absolute path to the defect (possibly-mutated) PNG. */
  defectPath: string;
  /**
   * Stable identifier for the prompt revision used. For this study the prompt
   * is locked at `oracles/llm_judge/prompt.txt` (verbatim port of
   * VISUAL_ASSERTION_VISION_SYSTEM); promptId is the sha256 of that file
   * recorded into each judgment for forensic reproducibility.
   */
  promptId: string;
  /**
   * Model version actually invoked. For pinned-by-identifier providers this is
   * the constant (e.g. 'gpt-4o-2024-11-20'). For Gemini this is the runtime-
   * resolved snapshot (see §12 Decision A of the pre-reg).
   */
  modelVersion: string;
}

export interface JudgeResponse {
  /** Parsed verdict, or 'fail' as a safe default when malformed. */
  verdict: 'pass' | 'fail';
  /** One-sentence rationale from the model, or a marker string if malformed. */
  rationale: string;
  /** Untouched provider response text. Useful for post-hoc audit. */
  rawResponse: string;
  /** Provider-reported input tokens, when available. */
  promptTokens?: number;
  /** Provider-reported output tokens, when available. */
  completionTokens?: number;
  /**
   * Per-call USD cost, computed by the provider wrapper using the rates in
   * `cost_constants.ts`. Llama (local Ollama) reports 0.
   */
  costUsd?: number;
  /** Wall-clock latency from request issued to response received, milliseconds. */
  latencyMs: number;
  /** Same as JudgeRequest.modelVersion, copied for self-contained records. */
  modelVersion: string;
  /** ISO 8601 UTC timestamp of when the response was received. */
  timestamp: string;
  /**
   * True if the model's response did not parse as the required single-line
   * JSON {verdict, rationale} after one retry. Per pre-reg §6, malformed
   * judgments are treated as missing data and excluded from primary analysis.
   */
  malformed?: boolean;
}

export interface Judge {
  /**
   * Stable model identifier. For pinned providers: the literal version pin.
   * For Gemini: the runtime-resolved snapshot (also written to
   * `results/judgments_metadata.json` on first invocation).
   */
  modelId: string;
  /**
   * Run one judgment. The wrapper is responsible for:
   *   (1) loading both PNGs from disk,
   *   (2) constructing the vision-API call,
   *   (3) parsing the response into JudgeResponse,
   *   (4) measuring latency and tokens,
   *   (5) computing USD cost from cost_constants.ts.
   * The dispatcher handles retries on malformed responses.
   */
  judge(req: JudgeRequest): Promise<JudgeResponse>;
}

/** Helper for parsing the single-line JSON verdict per the prompt contract. */
export function parseVerdictJson(raw: string): {
  verdict: 'pass' | 'fail';
  rationale: string;
  malformed: boolean;
} {
  const trimmed = raw.trim();
  // Models occasionally wrap in code fences despite "no fences" instruction.
  const stripped = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  try {
    const obj = JSON.parse(stripped);
    if (
      obj &&
      typeof obj === 'object' &&
      (obj.verdict === 'pass' || obj.verdict === 'fail') &&
      typeof obj.rationale === 'string'
    ) {
      return { verdict: obj.verdict, rationale: obj.rationale, malformed: false };
    }
    return {
      verdict: 'fail',
      rationale: 'MALFORMED: parseable JSON but missing required fields',
      malformed: true,
    };
  } catch {
    return {
      verdict: 'fail',
      rationale: 'MALFORMED: response did not parse as JSON',
      malformed: true,
    };
  }
}
