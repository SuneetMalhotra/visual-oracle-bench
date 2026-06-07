// oracles/llm_judge/cost_constants.ts
//
// Per-million-tokens USD pricing snapshots for the four LLM judges.
//
// IMPORTANT: these are point-in-time prices captured 2026-06-06. LLM pricing
// is renegotiated on a quarterly-or-faster cadence by all four providers; the
// reviewer running W7 LLM-judge dispatch MUST re-verify each row against the
// published pricing page before relying on the cost meter or the §1500 budget
// gate. The relevant dispatcher (`dispatcher.ts`) prints a "cost-constants
// snapshot date" banner on startup as a reminder.
//
// Pricing pages (cited per pre-reg `§7 Reproducibility commitments`):
//   GPT-4o            -> https://openai.com/api/pricing/
//   Claude Sonnet 4.5 -> https://www.anthropic.com/pricing
//   Gemini 2.5 Pro    -> https://ai.google.dev/gemini-api/docs/pricing
//   Llama 3.2 Vision  -> $0 (local Ollama; no per-token cost)
//
// For vision-input models, the API meter unit-counts image tokens differently
// per provider (OpenAI charges per-image based on resolution; Anthropic adds
// a per-image base; Gemini blends image + text). The cost meter approximates
// using the provider's documented per-token rate applied to the
// providerSDK-reported token totals (input + output), which is the most
// faithful first-order estimate available without manual provider-by-provider
// per-image accounting. For exact budget tracking the reviewer should
// cross-check the per-call cost against the provider's billing dashboard.

export interface ModelPricing {
  /** Provider-reported pinned identifier (matches `modelVersion` in the JudgeResponse). */
  modelId: string;
  /** USD per 1,000,000 input tokens (text + image-token equivalent). */
  inputUsdPerMTok: number;
  /** USD per 1,000,000 output tokens. */
  outputUsdPerMTok: number;
  /** Source pricing-page URL, retained in artifacts for reviewer audit. */
  pricingPageUrl: string;
  /** ISO 8601 date the rate was captured from the page. */
  snapshotDate: string;
}

// snapshot date applies to all rows below
const SNAPSHOT_DATE = '2026-06-06';

// GPT-4o (`gpt-4o-2024-11-20`): pinned per pre-reg §4.4.
// Published rate as of 2026-06-06 on https://openai.com/api/pricing/ :
//   input  $2.50 / 1M tokens
//   output $10.00 / 1M tokens
// (Vision input is billed as input tokens at the same per-token rate; image
// tokenization happens server-side and is reflected in `usage.prompt_tokens`.)
export const PRICING_GPT4O: ModelPricing = {
  modelId: 'gpt-4o-2024-11-20',
  inputUsdPerMTok: 2.5,
  outputUsdPerMTok: 10.0,
  pricingPageUrl: 'https://openai.com/api/pricing/',
  snapshotDate: SNAPSHOT_DATE,
};

// Claude Sonnet 4.5 (`claude-sonnet-4-5-20250929`): pinned per pre-reg §4.4.
// Published rate as of 2026-06-06 on https://www.anthropic.com/pricing :
//   input  $3.00 / 1M tokens
//   output $15.00 / 1M tokens
// (Image input is billed as input tokens at the same per-token rate; the
// Anthropic Messages API reports image-derived tokens in `usage.input_tokens`.)
export const PRICING_CLAUDE_SONNET_4_5: ModelPricing = {
  modelId: 'claude-sonnet-4-5-20250929',
  inputUsdPerMTok: 3.0,
  outputUsdPerMTok: 15.0,
  pricingPageUrl: 'https://www.anthropic.com/pricing',
  snapshotDate: SNAPSHOT_DATE,
};

// Gemini 2.5 Pro: published rate as of 2026-06-06 on
// https://ai.google.dev/gemini-api/docs/pricing
//   input  $1.25 / 1M tokens  (for prompts <=200k tokens; higher tier above)
//   output $10.00 / 1M tokens (for prompts <=200k tokens; higher tier above)
// Per pre-reg §12 Decision A the exact Gemini snapshot is pinned at the W7
// first-judgment run; that snapshot is recorded into `modelVersion` and into
// `results/judgments_metadata.json`. The price table is keyed off the snapshot
// identifier the reviewer supplies via env var `GEMINI_MODEL_VERSION`; if a
// snapshot other than 2.5 Pro is selected, the reviewer must update this
// entry before running.
export const PRICING_GEMINI_2_5_PRO: ModelPricing = {
  modelId: 'gemini-2.5-pro-latest',
  inputUsdPerMTok: 1.25,
  outputUsdPerMTok: 10.0,
  pricingPageUrl: 'https://ai.google.dev/gemini-api/docs/pricing',
  snapshotDate: SNAPSHOT_DATE,
};

// Llama 3.2 Vision 11B served via local Ollama: $0 marginal cost (compute
// time + electricity not modeled). Pinned per pre-reg §4.4 as
// `llama3.2-vision:11b`. The cost meter still records latency for cost-of-
// time comparisons in the §5.3 exploratory cost-accuracy Pareto frontier.
export const PRICING_LLAMA_OLLAMA: ModelPricing = {
  modelId: 'llama3.2-vision:11b',
  inputUsdPerMTok: 0,
  outputUsdPerMTok: 0,
  pricingPageUrl: 'local Ollama; no per-token cost',
  snapshotDate: SNAPSHOT_DATE,
};

/** Pure-arithmetic cost computation. Exported separately so it is unit-testable. */
export function computeCostUsd(
  pricing: ModelPricing,
  promptTokens: number,
  completionTokens: number,
): number {
  const inCost = (promptTokens / 1_000_000) * pricing.inputUsdPerMTok;
  const outCost = (completionTokens / 1_000_000) * pricing.outputUsdPerMTok;
  return inCost + outCost;
}

/** All four pricing rows in a registry for the dispatcher's startup banner. */
export const ALL_PRICING: ModelPricing[] = [
  PRICING_GPT4O,
  PRICING_CLAUDE_SONNET_4_5,
  PRICING_GEMINI_2_5_PRO,
  PRICING_LLAMA_OLLAMA,
];
