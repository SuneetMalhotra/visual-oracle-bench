// oracles/llm_judge/llama_ollama.ts
//
// LLM judge: Llama 3.2 Vision 11B served via local Ollama. Model pinned to
// `llama3.2-vision:11b` per pre-registration §4.4. Zero per-call cost
// (compute time + electricity not modeled).
//
// Calls Ollama's HTTP API at http://localhost:11434/api/generate by default
// (POST with model name, prompt, base64 images). On unreachable Ollama the
// wrapper throws a clear error pointing at `ollama serve` / `ollama pull`.
//
// Single-image limitation workaround (discovered Phase 1 W7 dispatch 2026-06-06):
// llama3.2-vision:11b refuses requests with more than one image
// ("this model only supports one image while more than one image requested").
// We composite the baseline and defect images side-by-side into a single PNG
// (sharp) with a centered labeled separator, preserving the comparison
// semantics that Claude/OpenAI receive natively. The composite is built in
// memory per request; no side effects on disk.

import { readFileSync, existsSync } from 'node:fs';
import sharp from 'sharp';
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

    // Composite baseline + defect side-by-side into ONE image. llama3.2-vision:11b
    // does not accept multi-image requests; this is the documented workaround.
    const compositeB64 = await this.compositeBaselineAndDefect(
      req.baselinePath,
      req.defectPath,
    );

    const userText =
      `prompt_id=${req.promptId}\n` +
      `ONE image attached: it shows the baseline (LEFT half, labeled "BASELINE") ` +
      `and the defect-candidate (RIGHT half, labeled "DEFECT-CANDIDATE") side-by-side, ` +
      `separated by a vertical divider. ` +
      `Judge the defect-candidate (RIGHT) against the baseline (LEFT). ` +
      `Output exactly one JSON object per the system instructions.`;

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
          images: [compositeB64], // single composite per llama3.2-vision limitation
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

  /**
   * Build a side-by-side composite (baseline LEFT, defect RIGHT) with a
   * 4px black vertical divider and a 24px label band on top of each half.
   * Returns base64 PNG. The composite is normalized to a consistent height
   * (both images resized to the same height as the taller original, keeping
   * aspect ratios via 'contain' fit with a white background).
   */
  private async compositeBaselineAndDefect(
    baselinePath: string,
    defectPath: string,
  ): Promise<string> {
    const baselineMeta = await sharp(baselinePath).metadata();
    const defectMeta = await sharp(defectPath).metadata();
    const targetHeight = Math.max(baselineMeta.height ?? 0, defectMeta.height ?? 0);
    if (targetHeight === 0) {
      throw new Error(
        `LlamaOllamaJudge: could not read image dimensions ` +
          `(baseline=${baselineMeta.height}, defect=${defectMeta.height})`,
      );
    }
    const labelBandHeight = 28;
    const dividerWidth = 4;

    const baselineResized = await sharp(baselinePath)
      .resize({ height: targetHeight, fit: 'contain', background: '#ffffff' })
      .png()
      .toBuffer();
    const defectResized = await sharp(defectPath)
      .resize({ height: targetHeight, fit: 'contain', background: '#ffffff' })
      .png()
      .toBuffer();

    const baselineDims = await sharp(baselineResized).metadata();
    const defectDims = await sharp(defectResized).metadata();
    const baselineW = baselineDims.width ?? 0;
    const defectW = defectDims.width ?? 0;
    const totalWidth = baselineW + dividerWidth + defectW;
    const totalHeight = labelBandHeight + targetHeight;

    // Label band SVG (BASELINE | DEFECT-CANDIDATE), sized to the full width.
    const labelSvg = Buffer.from(
      `<svg width="${totalWidth}" height="${labelBandHeight}" xmlns="http://www.w3.org/2000/svg">` +
        `<rect x="0" y="0" width="${baselineW}" height="${labelBandHeight}" fill="#1f6feb"/>` +
        `<rect x="${baselineW}" y="0" width="${dividerWidth}" height="${labelBandHeight}" fill="#000000"/>` +
        `<rect x="${baselineW + dividerWidth}" y="0" width="${defectW}" height="${labelBandHeight}" fill="#cf222e"/>` +
        `<text x="${baselineW / 2}" y="${labelBandHeight - 8}" font-family="sans-serif" font-size="16" ` +
        `font-weight="bold" fill="white" text-anchor="middle">BASELINE (LEFT)</text>` +
        `<text x="${baselineW + dividerWidth + defectW / 2}" y="${labelBandHeight - 8}" font-family="sans-serif" ` +
        `font-size="16" font-weight="bold" fill="white" text-anchor="middle">DEFECT-CANDIDATE (RIGHT)</text>` +
        `</svg>`,
    );

    const composite = await sharp({
      create: {
        width: totalWidth,
        height: totalHeight,
        channels: 4,
        background: '#000000',
      },
    })
      .composite([
        { input: labelSvg, top: 0, left: 0 },
        { input: baselineResized, top: labelBandHeight, left: 0 },
        { input: defectResized, top: labelBandHeight, left: baselineW + dividerWidth },
      ])
      .png()
      .toBuffer();

    return composite.toString('base64');
  }
}
