// oracles/llm_judge/claude_oauth.ts
//
// LLM judge: Anthropic Claude via OAuth subprocess (`claude -p`).
//
// Per global user preference (CLAUDE.md): NO ANTHROPIC_API_KEY. All Claude
// access is via the Claude Code OAuth session. This judge invokes
// `claude -p --model <model>` as a subprocess, sending the system prompt
// + base64-encoded baseline + defect images via stdin.
//
// Model identifier is pinned at the W7 first-judgment run per pre-reg §4.4
// (version-at-run-time policy). The resolved model is read from env var
// VORACLE_CLAUDE_MODEL_ID (default: `claude-sonnet-4-5`); the exact resolved
// id is written to the judgments_metadata.json artifact and the manuscript
// §4.4 table.
//
// Cost: $0 (subscription-based; subscription tier covers usage).
// Latency: subprocess overhead + Claude wall clock. Typically 8-20s/judgment
// on a Max subscription (vs. 3-6s via Messages API).

import { spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { Judge, JudgeRequest, JudgeResponse, parseVerdictJson } from './types.js';

export interface ClaudeOAuthJudgeOptions {
  /** Override claude binary path. Default: looks up from PATH via `which claude`. */
  claudeBinaryPath?: string;
  /** Override model id. Default: env VORACLE_CLAUDE_MODEL_ID or 'claude-sonnet-4-5'. */
  modelId?: string;
  /** Override system prompt text (default: read from oracles/llm_judge/prompt.txt). */
  promptText?: string;
  /** Override request timeout, milliseconds. Default 180_000 (3 min). */
  timeoutMs?: number;
}

const DEFAULT_BIN_CANDIDATES = [
  `${process.env.HOME}/.local/bin/claude`,
  '/opt/homebrew/bin/claude',
  '/usr/local/bin/claude',
];

function resolveBinary(override?: string): string {
  if (override) return override;
  for (const c of DEFAULT_BIN_CANDIDATES) {
    if (existsSync(c)) return c;
  }
  return 'claude'; // fall back to PATH lookup
}

export class ClaudeOAuthJudge implements Judge {
  readonly modelId: string;
  private readonly bin: string;
  private readonly promptText: string;
  private readonly timeoutMs: number;

  constructor(opts: ClaudeOAuthJudgeOptions = {}, promptFilePath?: string) {
    this.bin = resolveBinary(opts.claudeBinaryPath);
    this.modelId =
      opts.modelId ?? process.env.VORACLE_CLAUDE_MODEL_ID ?? 'claude-sonnet-4-5';
    if (opts.promptText) {
      this.promptText = opts.promptText;
    } else {
      const path = promptFilePath ?? new URL('./prompt.txt', import.meta.url).pathname;
      if (!existsSync(path))
        throw new Error(`ClaudeOAuthJudge: prompt file not found at ${path}`);
      this.promptText = readFileSync(path, 'utf8').trim();
    }
    this.timeoutMs = opts.timeoutMs ?? 180_000;
  }

  isOperational(): boolean {
    return existsSync(this.bin) || this.bin === 'claude';
  }

  async judge(req: JudgeRequest): Promise<JudgeResponse> {
    const t0 = Date.now();
    const baseline = readFileSync(req.baselinePath);
    const defect = readFileSync(req.defectPath);

    // Compose the user message: the system prompt frames the task as
    // pass/fail verdict; claude -p does not support inline image attachment
    // via stdin in the same way the Messages API does, so we use the
    // file-path convention from agent-harness/intelligence.ts
    // VISUAL_ASSERTION_VISION_SYSTEM, which instructs the model to open
    // PNGs via its Read tool. We pass ABSOLUTE paths.
    const userMessage = [
      'BASELINE_IMAGE_PATH: ' + req.baselinePath,
      'DEFECT_IMAGE_PATH: ' + req.defectPath,
      '',
      'Open both PNGs using your Read tool, compare DEFECT_IMAGE_PATH against',
      'BASELINE_IMAGE_PATH, and apply the rubric in the system prompt.',
      'Output exactly one JSON object on a single line:',
      '{"verdict":"pass"|"fail","rationale":"one sentence"}',
    ].join('\n');

    // Suppress unused-var warning while keeping the binding for future use
    // (when claude -p adds direct image stdin support).
    void baseline;
    void defect;

    const combined = `${this.promptText}\n\n---\n\n${userMessage}`;
    const timestamp = new Date().toISOString();

    return new Promise<JudgeResponse>((resolve) => {
      const child = spawn(this.bin, ['-p', '--model', this.modelId], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

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
        const parsed = parseVerdictJson(raw);
        // parseVerdictJson never returns null — it returns malformed:true on
        // parse failure. The old `!parsed` check was always false, so parse
        // failures leaked through the success branch with malformed:false and
        // a defaulted 'fail' verdict (bug found 2026-06-10: 317/400 claude
        // rows and 225/400 codex rows in the 06-07 parquet were silent parse
        // failures counted as valid verdicts).
        if (code !== 0 || parsed.malformed) {
          resolve({
            verdict: 'fail',
            rationale: code !== 0 ? `claude -p exited ${code}; unparseable` : parsed.rationale,
            rawResponse: raw,
            latencyMs,
            costUsd: 0,
            modelVersion: this.modelId,
            timestamp,
            malformed: true,
          });
          return;
        }
        resolve({
          verdict: parsed.verdict,
          rationale: parsed.rationale,
          rawResponse: raw,
          latencyMs,
          costUsd: 0, // OAuth subscription — no per-call cost
          modelVersion: this.modelId,
          timestamp,
          malformed: false,
        });
      });

      child.stdin.write(combined);
      child.stdin.end();
    });
  }
}
