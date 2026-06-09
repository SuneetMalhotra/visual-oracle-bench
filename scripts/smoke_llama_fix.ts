// scripts/smoke_llama_fix.ts
// Smoke test the patched Llama judge on 1 pair from the manifest.
// Run: npx tsx scripts/smoke_llama_fix.ts

import { readFileSync } from 'node:fs';
import { LlamaOllamaJudge } from '../oracles/llm_judge/llama_ollama.js';

async function main(): Promise<void> {
  const manifest = JSON.parse(readFileSync('data/images/_pairs_manifest.json', 'utf8'));
  const pair = manifest.results[0];
  console.log('Smoke-testing on:', pair.app, pair.defect_id);

  const judge = new LlamaOllamaJudge();
  const start = Date.now();
  const ping = await judge.ping();
  console.log('Ollama ping:', ping);
  if (!ping) {
    console.error('Ollama not reachable; abort');
    process.exit(1);
  }

  const resp = await judge.judge({
    baselinePath: pair.baseline,
    defectPath: pair.defect,
    promptId: 'smoke-test-fix-2026-06-09',
    modelVersion: 'llama3.2-vision:11b',
  });
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log('---');
  console.log('verdict:', resp.verdict);
  console.log('malformed:', resp.malformed);
  console.log('latencyMs:', resp.latencyMs, '(', elapsed, 's wall)');
  console.log('rationale:', String(resp.rationale).slice(0, 300));
  console.log('rawResponse (first 400):', String(resp.rawResponse).slice(0, 400));
}

main().catch((e) => {
  console.error('SMOKE TEST FAILED:', e);
  process.exit(1);
});
