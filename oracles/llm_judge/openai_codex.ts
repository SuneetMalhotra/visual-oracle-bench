// oracles/llm_judge/openai_codex.ts
//
// LLM judge: OpenAI GPT-family via Codex CLI subprocess (`codex exec`).
//
// Per user instruction (2026-06-06): use OpenAI ChatGPT/Codex subscription
// instead of OPENAI_API_KEY. The Codex CLI (`/opt/homebrew/bin/codex`)
// authenticates via the user's existing ChatGPT subscription session.
//
// Pre-registration §4.4: per Decision A (version-at-run-time policy),
// the OpenAI model identifier used by Codex CLI is pinned at the W7
// first-judgment run, NOT now. The resolved model is read from env var
// VORACLE_OPENAI_MODEL_ID (default: 'gpt-5-codex'); the exact resolved id
// is written to judgments_metadata.json and quoted in manuscript §4.4.
//
// Cost: $0 (subscription-based).
// Latency: subprocess overhead + Codex wall clock.

import { spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { Judge, JudgeRequest, JudgeResponse, parseVerdictJson } from './types.js';

export interface OpenAICodexJudgeOptions {
  /** Override codex binary path. Default: /opt/homebrew/bin/codex (or PATH). */
  codexBinaryPath?: string;
  /** Override model id. Default: env VORACLE_OPENAI_MODEL_ID or 'gpt-5-codex'. */
  modelId?: string;
  /** Override system prompt text (default: read from oracles/llm_judge/prompt.txt). */
  promptText?: string;
  /** Override request timeout, milliseconds. Default 180_000. */
  timeoutMs?: number;
  /** Sandbox mode. Default: read-only (no filesystem writes). */
  sandboxMode?: 'read-only' | 'workspace-write' | 'danger-full-access';
  /** Approval policy. Default: never. */
  approvalPolicy?: 'never' | 'untrusted' | 'on-request' | 'on-failure';
}

const DEFAULT_BIN_CANDIDATES = [
  '/opt/homebrew/bin/codex',
  '/usr/local/bin/codex',
  `${process.env.HOME}/.local/bin/codex`,
];

function resolveBinary(override?: string): string {
  if (override) return override;
  for (const c of DEFAULT_BIN_CANDIDATES) {
    if (existsSync(c)) return c;
  }
  return 'codex';
}

export class OpenAICodexJudge implements Judge {
  readonly modelId: string;
  private readonly bin: string;
  private readonly promptText: string;
  private readonly timeoutMs: number;
  private readonly sandboxMode: string;
  private readonly approvalPolicy: string;

  constructor(opts: OpenAICodexJudgeOptions = {}, promptFilePath?: string) {
    this.bin = resolveBinary(opts.codexBinaryPath);
    this.modelId =
      opts.modelId ?? process.env.VORACLE_OPENAI_MODEL_ID ?? 'gpt-5-codex';
    if (opts.promptText) {
      this.promptText = opts.promptText;
    } else {
      const path = promptFilePath ?? new URL('./prompt.txt', import.meta.url).pathname;
      if (!existsSync(path))
        throw new Error(`OpenAICodexJudge: prompt file not found at ${path}`);
      this.promptText = readFileSync(path, 'utf8').trim();
    }
    this.timeoutMs = opts.timeoutMs ?? 180_000;
    this.sandboxMode = opts.sandboxMode ?? 'read-only';
    this.approvalPolicy = opts.approvalPolicy ?? 'never';
  }

  isOperational(): boolean {
    return existsSync(this.bin) || this.bin === 'codex';
  }

  async judge(req: JudgeRequest): Promise<JudgeResponse> {
    const t0 = Date.now();
    const timestamp = new Date().toISOString();

    const task = [
      this.promptText,
      '',
      '---',
      '',
      'BASELINE_IMAGE_PATH: ' + req.baselinePath,
      'DEFECT_IMAGE_PATH: ' + req.defectPath,
      '',
      'Read both PNGs from the absolute paths above and apply the rubric.',
      'Output exactly one JSON object on a single line and nothing else:',
      '{"verdict":"pass"|"fail","rationale":"one sentence"}',
    ].join('\n');

    return new Promise<JudgeResponse>((resolve) => {
      // codex exec syntax: codex -s <sandbox> -a <approval> exec "<task>"
      // We pass the task on stdin instead of as an arg to avoid arg-length limits
      // and shell-escaping headaches.
      const child = spawn(
        this.bin,
        ['-s', this.sandboxMode, '-a', this.approvalPolicy, 'exec', '-'],
        { stdio: ['pipe', 'pipe', 'pipe'] },
      );

      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        const latencyMs = Date.now() - t0;
        resolve({
          verdict: 'fail',
          rationale: `timeout after ${this.timeoutMs}ms`,
          rawResponse: stdout + stderr,
          latencyMs,
          costUsd: 0,
          modelVersion: this.modelId,
          timestamp,
          malformed: true,
        });
      }, this.timeoutMs);

      child.stdout.on('data', (d) => (stdout += d.toString()));
      child.stderr.on('data', (d) => (stderr += d.toString()));
      child.on('error', (e) => {
        clearTimeout(timer);
        const latencyMs = Date.now() - t0;
        resolve({
          verdict: 'fail',
          rationale: `spawn error: ${e.message}`,
          rawResponse: stderr,
          latencyMs,
          costUsd: 0,
          modelVersion: this.modelId,
          timestamp,
          malformed: true,
        });
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        const latencyMs = Date.now() - t0;
        const raw = stdout.trim();
        // Codex output may have a preamble; find the last valid JSON line
        const jsonLine =
          raw
            .split('\n')
            .reverse()
            .find((l) => l.trim().startsWith('{') && l.trim().endsWith('}')) ?? raw;
        const parsed = parseVerdictJson(jsonLine);
        if (code !== 0 || !parsed) {
          resolve({
            verdict: 'fail',
            rationale: parsed?.rationale ?? `codex exited ${code}; unparseable`,
            rawResponse: raw,
            latencyMs,
            costUsd: 0,
            modelVersion: this.modelId,
            timestamp,
            malformed: !parsed,
          });
          return;
        }
        resolve({
          verdict: parsed.verdict,
          rationale: parsed.rationale,
          rawResponse: raw,
          latencyMs,
          costUsd: 0, // ChatGPT subscription — no per-call cost
          modelVersion: this.modelId,
          timestamp,
          malformed: false,
        });
      });

      child.stdin.write(task);
      child.stdin.end();
    });
  }
}
