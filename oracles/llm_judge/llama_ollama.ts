// oracles/llm_judge/llama_ollama.ts
//
// LLM judge: Llama 3.2 Vision 11B served via local Ollama. Model pinned to
// `llama3.2-vision:11b` per pre-registration §4.4. Zero per-call cost
// (compute time + electricity not modeled).
//
// Calls Ollama's HTTP API at http://localhost:11434/api/generate by default
// (POST with model name, prompt, base64 images). On unreachable Ollama the
// wrapper throws a clear error pointing at `ollama serve` / `ollama pull`.

import { readFileSync, existsSync } from 'node:fs';
import { Judge, JudgeRequest, JudgeResponse, parseVerdictJson } from './types.js';
import { PRICING_LLAMA_OLLAMA, computeCostUsd } from './cost_constants.js';

export interface LlamaOllamaJudgeOptions {
  /** Ollama endpoint base. Default env OLLAMA_HOST or http://localhost:11434. */
  baseUrl?: string;
  /** Override model id (default: pinned per pre-reg §4.4). */
  modelId?: string;
  /** Override system prompt text (default: read from oracles/llm_judge/prompt.txt). */
  promptText?: string;
  /** Override request timeout, milliseconds. Default 300_000 (vision model is slow). */
  timeoutMs?: number;
}

const PINNED_MODEL_ID = 'llama3.2-vision:11b'; // pre-reg §4.4
const DEFAULT_BASE_URL = 'http://localhost:11434';

export class LlamaOllamaJudge implements Judge {
  readonly modelId: string;
  private readonly baseUrl: string;
  private readonly promptText: string;
  private readonly timeoutMs: number;

  constructor(opts: LlamaOllamaJudgeOptions = {}, promptFilePath?: string) {
    this.modelId = opts.modelId ?? PINNED_MODEL_ID;
    this.baseUrl = (opts.baseUrl ?? process.env.OLLAMA_HOST ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    if (opts.promptText) {
      this.promptText = opts.promptText;
    } else {
      const path = promptFilePath ?? new URL('./prompt.txt', import.meta.url).pathname;
      if (!existsSync(path)) throw new Error(`LlamaOllamaJudge: prompt file not found at ${path}`);
      this.promptText = readFileSync(path, 'utf8').trim();
    }
    this.timeoutMs = opts.timeoutMs ?? 300_000;
  }

  /**
   * Ollama doesn't use API keys. "Operational" here means: the unit test
   * doesn't try to verify network reachability (that would require a real
   * Ollama at localhost). The dispatcher will surface the unreachable error
   * at first .judge() call, with a clear message pointing at `ollama serve`.
   */
  isOperational(): boolean {
    return true;
  }

  /** Lightweight reachability probe -- used by unit test for the "throws on unreachable" assertion. */
  async ping(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`${this.baseUrl}/api/tags`, { signal: controller.signal });
      clearTimeout(timer);
      return res.ok;
    } catch {
      return false;
    }
  }

  async judge(req: JudgeRequest): Promise<JudgeResponse> {
    if (!existsSync(req.baselinePath)) throw new Error(`baseline not found: ${req.baselinePath}`);
    if (!existsSync(req.defectPath)) throw new Error(`defect not found: ${req.defectPath}`);

    const baselineB64 = readFileSync(req.baselinePath).toString('base64');
    const defectB64 = readFileSync(req.defectPath).toString('base64');

    const userText =
      `prompt_id=${req.promptId}\n` +
      `Two images attached: first=baseline (clean), second=defect-candidate.\n` +
      `Judge the defect-candidate image. Output exactly one JSON object per the system instructions.`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const startMs = Date.now();
    try {
      const res = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.modelId,
          system: this.promptText,
          prompt: userText,
          stream: false,
          format: 'json',
          images: [baselineB64, defectB64],
          options: { temperature: 0, num_predict: 200 },
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(
          `LlamaOllamaJudge: HTTP ${res.status} at ${this.baseUrl}/api/generate: ` +
            `${body.slice(0, 500)}\n` +
            `Hint: run 'ollama serve' and 'ollama pull ${this.modelId}' before invoking.`,
        );
      }
      const data = (await res.json()) as {
        response?: string;
        prompt_eval_count?: number;
        eval_count?: number;
      };
      const latencyMs = Date.now() - startMs;
      const raw = (data.response ?? '').trim();
      const promptTokens = data.prompt_eval_count ?? 0;
      const completionTokens = data.eval_count ?? 0;
      const parsed = parseVerdictJson(raw);
      return {
        verdict: parsed.verdict,
        rationale: parsed.rationale,
        rawResponse: raw,
        promptTokens,
        completionTokens,
        costUsd: computeCostUsd(PRICING_LLAMA_OLLAMA, promptTokens, completionTokens), // == 0
        latencyMs,
        modelVersion: this.modelId,
        timestamp: new Date().toISOString(),
        malformed: parsed.malformed,
      };
    } catch (e: unknown) {
      if ((e as Error).name === 'AbortError') {
        throw new Error(
          `LlamaOllamaJudge: request to ${this.baseUrl} timed out after ${this.timeoutMs}ms ` +
            `(model=${this.modelId}). Llama vision inference can be slow; consider raising timeoutMs.`,
        );
      }
      // fetch() throws on network-level errors with a generic message; rewrap.
      const msg = (e as Error).message ?? String(e);
      if (msg.includes('fetch failed') || msg.includes('ECONNREFUSED')) {
        throw new Error(
          `LlamaOllamaJudge: cannot reach Ollama at ${this.baseUrl}. ` +
            `Hint: run 'ollama serve' in another terminal and confirm with 'curl ${this.baseUrl}/api/tags'.`,
        );
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
}
