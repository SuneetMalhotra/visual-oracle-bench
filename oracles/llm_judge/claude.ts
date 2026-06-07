// oracles/llm_judge/claude.ts
//
// LLM judge: Anthropic Claude Sonnet 4.5. Model pinned to
// `claude-sonnet-4-5-20250929` per pre-registration §4.4.
//
// Uses the Messages API with two image content blocks (baseline + defect)
// encoded as base64 PNG. The system prompt is the verbatim
// VISUAL_ASSERTION_VISION_SYSTEM from prompt.txt.
//
// Per global user preference, the project's interactive workflow uses Claude
// OAuth (`claude -p`) instead of API keys, but the W7 LLM-judge batch must run
// thousands of automated requests in parallel against a known-pinned model
// snapshot, which requires the Messages API and ANTHROPIC_API_KEY. The
// reviewer running W7 supplies the key explicitly; absent the key, this
// wrapper raises a clear error and does NOT fall back to anything.

import { readFileSync, existsSync } from 'node:fs';
import { Judge, JudgeRequest, JudgeResponse, parseVerdictJson } from './types.js';
import { PRICING_CLAUDE_SONNET_4_5, computeCostUsd } from './cost_constants.js';

export interface ClaudeJudgeOptions {
  /** API key. Defaults to process.env.ANTHROPIC_API_KEY. Required to invoke. */
  apiKey?: string;
  /** Override model id (default: pinned per pre-reg §4.4). */
  modelId?: string;
  /** Override system prompt text (default: read from oracles/llm_judge/prompt.txt). */
  promptText?: string;
  /** Override request timeout, milliseconds. Default 120_000. */
  timeoutMs?: number;
}

const PINNED_MODEL_ID = 'claude-sonnet-4-5-20250929'; // pre-reg §4.4

export class ClaudeJudge implements Judge {
  readonly modelId: string;
  private readonly apiKey: string | undefined;
  private readonly promptText: string;
  private readonly timeoutMs: number;
  private client: unknown = null;

  constructor(opts: ClaudeJudgeOptions = {}, promptFilePath?: string) {
    this.modelId = opts.modelId ?? PINNED_MODEL_ID;
    this.apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (opts.promptText) {
      this.promptText = opts.promptText;
    } else {
      const path = promptFilePath ?? new URL('./prompt.txt', import.meta.url).pathname;
      if (!existsSync(path)) throw new Error(`ClaudeJudge: prompt file not found at ${path}`);
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
        'ClaudeJudge: ANTHROPIC_API_KEY is not set. The W7 LLM-judge batch requires ' +
          'the Messages API + pinned snapshot (claude-sonnet-4-5-20250929) and ' +
          'cannot use OAuth -- export ANTHROPIC_API_KEY before calling .judge().',
      );
    }
    if (!existsSync(req.baselinePath)) throw new Error(`baseline not found: ${req.baselinePath}`);
    if (!existsSync(req.defectPath)) throw new Error(`defect not found: ${req.defectPath}`);

    if (!this.client) {
      const mod: { default: new (cfg: { apiKey: string; timeout?: number }) => unknown } =
        await import('@anthropic-ai/sdk');
      const Anthropic = mod.default;
      this.client = new Anthropic({ apiKey: this.apiKey, timeout: this.timeoutMs });
    }

    const baselineB64 = readFileSync(req.baselinePath).toString('base64');
    const defectB64 = readFileSync(req.defectPath).toString('base64');

    const userText =
      `prompt_id=${req.promptId}\n` +
      `Baseline (clean) image: first attachment.\n` +
      `Defect-candidate image: second attachment.\n` +
      `Judge the defect-candidate image. Output exactly one JSON object per the system instructions.`;

    const startMs = Date.now();
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const client: any = this.client;
    const message = await client.messages.create({
      model: this.modelId,
      max_tokens: 200,
      temperature: 0,
      system: this.promptText,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: userText },
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/png', data: baselineB64 },
            },
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/png', data: defectB64 },
            },
          ],
        },
      ],
    });
    /* eslint-enable @typescript-eslint/no-explicit-any */
    const latencyMs = Date.now() - startMs;
    // Anthropic Messages returns content as an array of blocks; first text block.
    const blocks: Array<{ type: string; text?: string }> = message?.content ?? [];
    const textBlock = blocks.find((b) => b.type === 'text');
    const raw: string = textBlock?.text ?? '';
    const usage = message?.usage ?? { input_tokens: 0, output_tokens: 0 };
    const promptTokens: number = usage.input_tokens ?? 0;
    const completionTokens: number = usage.output_tokens ?? 0;
    const parsed = parseVerdictJson(raw);
    return {
      verdict: parsed.verdict,
      rationale: parsed.rationale,
      rawResponse: raw,
      promptTokens,
      completionTokens,
      costUsd: computeCostUsd(PRICING_CLAUDE_SONNET_4_5, promptTokens, completionTokens),
      latencyMs,
      modelVersion: this.modelId,
      timestamp: new Date().toISOString(),
      malformed: parsed.malformed,
    };
  }
}
