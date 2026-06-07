// oracles/llm_judge/gpt4o.ts
//
// LLM judge: OpenAI GPT-4o (vision). Model pinned to `gpt-4o-2024-11-20` per
// pre-registration §4.4.
//
// The wrapper:
//   - Lazy-instantiates the OpenAI SDK only if OPENAI_API_KEY is present
//     (so typecheck + unit-tests do not require an API key).
//   - Loads both PNGs from disk and submits as base64-encoded
//     image_url data URIs in the user message content array (the OpenAI
//     vision input convention as of SDK v6).
//   - Embeds the prompt-id (sha256 of prompt.txt) in the user message so
//     judgments can be traced back to the exact prompt revision.
//   - Reports usage tokens and computes USD cost via cost_constants.ts.
//   - On non-200 / throw, raises a clear error -- never silently retries here;
//     the dispatcher owns retry policy per pre-reg §6 (one retry on malformed,
//     then mark malformed:true).

import { readFileSync, existsSync } from 'node:fs';
import { Judge, JudgeRequest, JudgeResponse, parseVerdictJson } from './types.js';
import { PRICING_GPT4O, computeCostUsd } from './cost_constants.js';

export interface Gpt4oJudgeOptions {
  /** API key. Defaults to process.env.OPENAI_API_KEY. Required to invoke. */
  apiKey?: string;
  /** Override model id (default: pinned per pre-reg §4.4). */
  modelId?: string;
  /** Override system prompt text (default: read from oracles/llm_judge/prompt.txt). */
  promptText?: string;
  /** Override request timeout, milliseconds. Default 120_000. */
  timeoutMs?: number;
}

const PINNED_MODEL_ID = 'gpt-4o-2024-11-20'; // pre-reg §4.4

export class Gpt4oJudge implements Judge {
  readonly modelId: string;
  private readonly apiKey: string | undefined;
  private readonly promptText: string;
  private readonly timeoutMs: number;
  private client: unknown = null; // lazy OpenAI client

  constructor(opts: Gpt4oJudgeOptions = {}, promptFilePath?: string) {
    this.modelId = opts.modelId ?? PINNED_MODEL_ID;
    this.apiKey = opts.apiKey ?? process.env.OPENAI_API_KEY;
    if (opts.promptText) {
      this.promptText = opts.promptText;
    } else {
      const path = promptFilePath ?? new URL('./prompt.txt', import.meta.url).pathname;
      if (!existsSync(path)) throw new Error(`Gpt4oJudge: prompt file not found at ${path}`);
      this.promptText = readFileSync(path, 'utf8').trim();
    }
    this.timeoutMs = opts.timeoutMs ?? 120_000;
  }

  /** True iff this judge can make real API calls (key + SDK both available). */
  isOperational(): boolean {
    return !!this.apiKey;
  }

  async judge(req: JudgeRequest): Promise<JudgeResponse> {
    if (!this.apiKey) {
      throw new Error(
        'Gpt4oJudge: OPENAI_API_KEY is not set. Export it before calling .judge(); ' +
          'see pre-reg §4.4 for the pinned model identifier and ' +
          'oracles/llm_judge/cost_constants.ts for the published per-token rate.',
      );
    }
    if (!existsSync(req.baselinePath)) throw new Error(`baseline not found: ${req.baselinePath}`);
    if (!existsSync(req.defectPath)) throw new Error(`defect not found: ${req.defectPath}`);

    // Lazy-load the SDK only when actually about to call. Keeps unit-tests
    // and typecheck free of network or auth requirements.
    if (!this.client) {
      const mod: { default: new (cfg: { apiKey: string; timeout?: number }) => unknown } =
        await import('openai');
      const OpenAI = mod.default;
      this.client = new OpenAI({ apiKey: this.apiKey, timeout: this.timeoutMs });
    }
    const baselineB64 = readFileSync(req.baselinePath).toString('base64');
    const defectB64 = readFileSync(req.defectPath).toString('base64');

    const userText =
      `prompt_id=${req.promptId}\n` +
      `Baseline (clean) image: attached first.\n` +
      `Defect-candidate image: attached second.\n` +
      `Judge the defect-candidate image. Output exactly one JSON object per the system instructions.`;

    const startMs = Date.now();
    // Typing the OpenAI SDK chat completions strongly here is more friction
    // than it is worth in a wrapper file; we use `any` only at the call site.
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const client: any = this.client;
    const completion = await client.chat.completions.create({
      model: this.modelId,
      max_tokens: 200,
      temperature: 0,
      messages: [
        { role: 'system', content: this.promptText },
        {
          role: 'user',
          content: [
            { type: 'text', text: userText },
            {
              type: 'image_url',
              image_url: { url: `data:image/png;base64,${baselineB64}` },
            },
            {
              type: 'image_url',
              image_url: { url: `data:image/png;base64,${defectB64}` },
            },
          ],
        },
      ],
    });
    /* eslint-enable @typescript-eslint/no-explicit-any */
    const latencyMs = Date.now() - startMs;
    const raw: string = completion?.choices?.[0]?.message?.content ?? '';
    const usage = completion?.usage ?? { prompt_tokens: 0, completion_tokens: 0 };
    const promptTokens: number = usage.prompt_tokens ?? 0;
    const completionTokens: number = usage.completion_tokens ?? 0;
    const parsed = parseVerdictJson(raw);
    return {
      verdict: parsed.verdict,
      rationale: parsed.rationale,
      rawResponse: raw,
      promptTokens,
      completionTokens,
      costUsd: computeCostUsd(PRICING_GPT4O, promptTokens, completionTokens),
      latencyMs,
      modelVersion: this.modelId,
      timestamp: new Date().toISOString(),
      malformed: parsed.malformed,
    };
  }
}
