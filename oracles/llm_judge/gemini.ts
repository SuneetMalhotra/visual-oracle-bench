// oracles/llm_judge/gemini.ts
//
// LLM judge: Google Gemini 2.5 Pro (vision).
//
// Per pre-registration §12 Decision A (Gemini version-pin policy):
//   The exact Gemini snapshot identifier is pinned at the W7 first-judgment
//   run, NOT at pre-registration time. The reviewer supplies the snapshot via
//   env var `GEMINI_MODEL_VERSION` (default `gemini-2.5-pro-latest`); the
//   resolved version is written into the JudgeResponse.modelVersion field of
//   every judgment AND into `results/judgments_metadata.json` on first
//   invocation of the dispatcher, which is the artifact the manuscript §4.4
//   table quotes verbatim.
//
// This file is the only judge that reads its model identifier at runtime;
// the GPT-4o, Claude, and Llama wrappers all hard-pin their identifiers.

import { readFileSync, existsSync } from 'node:fs';
import { Judge, JudgeRequest, JudgeResponse, parseVerdictJson } from './types.js';
import { PRICING_GEMINI_2_5_PRO, computeCostUsd } from './cost_constants.js';

export interface GeminiJudgeOptions {
  /** API key. Defaults to process.env.GOOGLE_API_KEY (or GEMINI_API_KEY). Required to invoke. */
  apiKey?: string;
  /**
   * Override the runtime-pinned model id. Default: env GEMINI_MODEL_VERSION,
   * else 'gemini-2.5-pro-latest'. This is the "version-at-run-time" handle
   * per pre-reg §12 Decision A.
   */
  modelId?: string;
  /** Override system prompt text (default: read from oracles/llm_judge/prompt.txt). */
  promptText?: string;
  /** Override request timeout, milliseconds. Default 120_000. */
  timeoutMs?: number;
}

const DEFAULT_GEMINI_MODEL = 'gemini-2.5-pro-latest';

export class GeminiJudge implements Judge {
  readonly modelId: string;
  private readonly apiKey: string | undefined;
  private readonly promptText: string;
  private readonly timeoutMs: number;
  private client: unknown = null;

  constructor(opts: GeminiJudgeOptions = {}, promptFilePath?: string) {
    this.modelId =
      opts.modelId ?? process.env.GEMINI_MODEL_VERSION ?? DEFAULT_GEMINI_MODEL;
    this.apiKey =
      opts.apiKey ?? process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY;
    if (opts.promptText) {
      this.promptText = opts.promptText;
    } else {
      const path = promptFilePath ?? new URL('./prompt.txt', import.meta.url).pathname;
      if (!existsSync(path)) throw new Error(`GeminiJudge: prompt file not found at ${path}`);
      this.promptText = readFileSync(path, 'utf8').trim();
    }
    this.timeoutMs = opts.timeoutMs ?? 120_000;
  }

  isOperational(): boolean {
    return !!this.apiKey;
  }

  async judge(req: JudgeRequest): Promise<JudgeResponse> {
    if (!this.apiKey) {
      throw new Error(
        'GeminiJudge: GOOGLE_API_KEY (or GEMINI_API_KEY) is not set. Pre-reg §12 ' +
          'Decision A pins the Gemini snapshot at the W7 first-judgment run; set ' +
          'GEMINI_MODEL_VERSION to lock the snapshot identifier and GOOGLE_API_KEY ' +
          'to authenticate.',
      );
    }
    if (!existsSync(req.baselinePath)) throw new Error(`baseline not found: ${req.baselinePath}`);
    if (!existsSync(req.defectPath)) throw new Error(`defect not found: ${req.defectPath}`);

    if (!this.client) {
      const mod: {
        GoogleGenerativeAI: new (apiKey: string) => unknown;
      } = await import('@google/generative-ai');
      const { GoogleGenerativeAI } = mod;
      this.client = new GoogleGenerativeAI(this.apiKey);
    }

    const baselineB64 = readFileSync(req.baselinePath).toString('base64');
    const defectB64 = readFileSync(req.defectPath).toString('base64');

    const userText =
      `prompt_id=${req.promptId}\n` +
      `Baseline (clean) image: first inline image.\n` +
      `Defect-candidate image: second inline image.\n` +
      `Judge the defect-candidate image. Output exactly one JSON object per the system instructions.`;

    const startMs = Date.now();
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const client: any = this.client;
    const model = client.getGenerativeModel({
      model: this.modelId,
      systemInstruction: this.promptText,
      generationConfig: { temperature: 0, maxOutputTokens: 200 },
    });
    const result = await model.generateContent([
      { text: userText },
      { inlineData: { mimeType: 'image/png', data: baselineB64 } },
      { inlineData: { mimeType: 'image/png', data: defectB64 } },
    ]);
    /* eslint-enable @typescript-eslint/no-explicit-any */
    const latencyMs = Date.now() - startMs;
    const response = result?.response;
    const raw: string = typeof response?.text === 'function' ? response.text() : '';
    const usageMeta = response?.usageMetadata ?? {};
    const promptTokens: number = usageMeta.promptTokenCount ?? 0;
    const completionTokens: number = usageMeta.candidatesTokenCount ?? 0;
    const parsed = parseVerdictJson(raw);
    return {
      verdict: parsed.verdict,
      rationale: parsed.rationale,
      rawResponse: raw,
      promptTokens,
      completionTokens,
      costUsd: computeCostUsd(PRICING_GEMINI_2_5_PRO, promptTokens, completionTokens),
      latencyMs,
      modelVersion: this.modelId,
      timestamp: new Date().toISOString(),
      malformed: parsed.malformed,
    };
  }
}
