# ARTIFACTS.md — Visual Oracle Bench reproducibility manifest

**Document version:** 1.6 (2026-06-11 — Option B integrity-audited resubmission; supersedes 1.0)
**Repo:** https://github.com/SuneetMalhotra/visual-oracle-bench
**Author:** Suneet Malhotra (ORCID 0009-0003-8707-9590)
**OSF pre-registration:** [10.17605/OSF.IO/NKD6J](https://osf.io/nkd6j/) (registered 2026-06-06, BEFORE any LLM judgments collected)
**License:** MIT (code) / CC-BY 4.0 (data, images, judgments, ground truth)

This manifest inventories every artifact a reviewer or independent replicator needs to verify the Phase 1 methodological pilot. The pre-registered Phase 2 experiment (live-Docker, 8 OSS apps) is a separate forthcoming submission; this manifest covers Phase 1 only.

---

## 1. What this paper is

A two-judge, specificity-inclusive synthetic-HTML pilot for LLM-as-judge visual regression oracles (manuscript: `manuscript/article3_phase1_v1_6.md`). Phase 1 reports:

- The reusable benchmark harness (injection primitives, capture orchestrator, dispatcher, judge wrappers, parquet result schema, analysis pipeline)
- A 600-pair synthetic-HTML corpus: 400 defect pairs (6 categories × 8 nominal profiles) + 200 identical-image control pairs (manifest v2)
- Full oracle metrics on the integrity-audited subset (confusion matrix, sensitivity, specificity, precision, F1, MCC), pairwise Cohen's κ with bootstrap CIs, exact paired McNemar tests with Holm correction
- A silent-fabrication detection + correction protocol (see §7 item 0 below and README "Data Integrity")
- An integration-failure catalog; Llama 3.2 Vision 11B is excluded from comparison (input-modality confound) and reported in the manuscript's Appendix A

Phase 1 does NOT answer the pre-registered RQ1 (does κ generalize across real applications?). That is reserved for Phase 2.

---

## 2. What's in the repo

### Code (MIT license)

| Path | Purpose | Tests |
|---|---|---|
| `injection/primitives.ts` | 6 deterministic defect-injection primitives (color, layout, missing, truncation, z-order, contrast) | `tests/test_primitives_unit.ts` |
| `capture/source-render-todomvc.ts` | Reference HTML renderer (synthetic-HTML fixture for Phase 1) | covered by smoke |
| `capture/per_app.ts` | Per-app capture driver harness | covered by smoke |
| `capture/drivers/<app>.ts` × 8 | Per-app drivers (Phase 2 — not exercised in Phase 1) | covered by smoke (Phase 2) |
| `scripts/capture_corpus.ts` | W6 corpus capture orchestrator (with `--offline-pipeline` for Phase 1 synthetic mode) | smoke + manual dry-run |
| `scripts/capture_pairs_manifest.ts` | Aggregates per-app ledgers into `_pairs_manifest.json` | manual |
| `scripts/offline_capture_pipeline.ts` | Pure-synthetic-HTML pipeline used in Phase 1 | covered by smoke |
| `oracles/pixel_diff.ts` | Deterministic pixel-SSIM oracle | `tests/test_oracles_unit.ts` |
| `oracles/phash.ts` | Deterministic perceptual-hash oracle | `tests/test_oracles_unit.ts` |
| `oracles/llm_judge/dispatcher.ts` | Multi-judge dispatcher with retry + parquet output | `tests/test_llm_judge_stubs.ts` |
| `oracles/llm_judge/openai_codex.ts` | OpenAI judge via Codex CLI subprocess (subscription path, $0) | `tests/test_llm_judge_stubs.ts` |
| `oracles/llm_judge/claude_oauth.ts` | Claude judge via `claude -p` subprocess (subscription path, $0) | `tests/test_llm_judge_stubs.ts` |
| `oracles/llm_judge/llama_ollama.ts` | Llama judge via local Ollama; **side-by-side composite workaround** for single-image limitation (sharp-based, see `compositeBaselineAndDefect`) | `tests/test_llama_composite_unit.ts` + `scripts/smoke_llama_fix.ts` |
| `oracles/llm_judge/{gpt4o,claude,gemini}.ts` | API-key judge variants (not used in Phase 1 default dispatch) | `tests/test_llm_judge_stubs.ts` |
| `oracles/llm_judge/cost_constants.ts` | Pricing snapshot (2026-06-06); used for budget gate | exercised by dispatcher |
| `analysis/analyze_judgments.py` | **Phase 1 analysis pipeline**: pairwise Cohen's κ + Fleiss' κ + per-judge accuracy vs ground truth + per-app + per-category + latency + cost; bootstrap 95% CIs (seed-pinned); outputs `phase1_analysis_<ts>.json` and `.md` | dry-run mode (`--dry-run`) |
| `scripts/reproduce_paper.sh` | One-shot offline reproduction: 7 stages (npm, playwright, primitives, oracles, judge stubs, llama composite, offline smoke) | runs end-to-end on a fresh clone |
| `scripts/smoke_llama_fix.ts` | Manual smoke test for the patched Llama judge against 1 pair from the manifest | runnable directly |
| `scripts/add_true_negatives.py` | Generates the 200 control pairs + manifest v2 (B.1, 2026-06-10) | manual |
| `scripts/launch_full_dispatch_2026-06-11.sh` | Launch script for the post-patch Codex control top-up dispatch | manual |
| `analysis/paired_tests.py` | Exact McNemar (both-clean intersection) + Holm correction; same row-inclusion rule as the analyzer | regenerates `paired_tests_latest.json` |

### Data + ground truth (CC-BY 4.0)

| Path | Description | Phase |
|---|---|---|
| `data/images/<app>/baseline/*.png` | 400 baseline PNGs across 8 nominal app labels (synthetic-HTML in Phase 1) | Phase 1 |
| `data/images/<app>/defect/*.png` | 400 defect PNGs (each contains one programmatically-injected defect from one of 6 categories) | Phase 1 |
| `data/images/_pairs_manifest.json` | 400 pair entries with `(app, defect_id, category, surface, baseline, defect)` paths. **Ground truth is by construction**: every pair is baseline-vs-defect, so the expected verdict for every pair is `'fail'` (regression detected). | Phase 1 |
| `data/images/_corpus_summary.json` | Per-app capture summary | Phase 1 |
| `data/images/<app>/_capture_ledger.json` | Per-app ledger (which primitives applied where) | Phase 1 |

### Pre-registration (CC-BY 4.0)

| Path | Description |
|---|---|
| `preregistration/draft.md` | Full pre-registration text (also archived at OSF DOI 10.17605/OSF.IO/NKD6J on 2026-06-06) |
| `preregistration/source-visual-assertion-protocol.md` | Ported antecedent protocol |
| `preregistration/source-rater-instructions.md` | Reserved for Phase 2 human-rater calibration |

### Manuscript scaffolding

| Path | Description |
|---|---|
| `manuscript/skeleton.md` | Section-level outline with Phase 1 / Phase 2 framing (lines 12-16, §3.2, §6.2, §1 contributions, §4 results outline). Prose drafted in W13-W14 of the timeline. |

### Results (Phase 1)

| Path | Description |
|---|---|
| `results/judgments_2026-06-07T02-50-09-790Z.parquet` | Initial W7 dispatch (1,200 rows). **Retained unmodified for audit**: 392 Claude + 225 Codex rows are silent-fabrication artifacts (re-flagged at analysis time), plus 400 malformed Llama rows (single-image bug pre-fix). |
| `results/judgments_2026-06-09T22-16-41-218Z.parquet` | Llama re-run after sharp-composite workaround (2026-06-09). 400 rows, 0 malformed. Appendix-A only. |
| `results/judgments_2026-06-10T16-47-33-248Z.parquet` | Claude + Codex on the 200 control pairs. Claude: 125 clean + 75 silent-fab; Codex: 200/200 silent-fab (expired refresh token), superseded by the top-up below. |
| `results/judgments_2026-06-11T03-17-58-910Z.parquet` | **Codex control top-up** (patched wrappers, fail-fast gate). 200 rows, 0 malformed. |
| `data/images/_pairs_manifest_v2.json` | Manifest v2: 600 pairs with per-pair `expected_verdict` (`fail` × 400 defect, `pass` × 200 control). |
| `data/images/_topup_codex_2026-06-11.json` | Top-up manifest (the 200 control pairs re-dispatched to Codex only). |
| `results/judgments_metadata.json` | Run metadata (cost constants, judges, pricing snapshot, pre-reg link). Note: the dispatcher overwrites this per run; a reconstructed merged file is at `results/judgments_metadata_merged.json` if present. |
| `analysis/results/phase1_analysis_<ts>.json` | Machine-readable Phase 1 analysis output |
| `analysis/results/phase1_analysis_<ts>.md` | Human-readable Phase 1 analysis report (drop-in for manuscript §4) |
| `analysis/results/paired_tests_latest.json` | Exact McNemar + Holm output (manuscript §4.3) |

### Logs (not for publication; for audit only)

| Path | Description |
|---|---|
| `logs/w7_dispatch_*.log` | W7 dispatcher logs (Phase 1) |
| `logs/llama_rerun_*.log` | Llama re-run dispatcher logs (Phase 1) |

---

## 3. How to reproduce Phase 1 from a fresh clone

### Step 1 — Offline reproducibility (no Docker, no LLM calls, no subscriptions)

```bash
git clone https://github.com/SuneetMalhotra/visual-oracle-bench
cd visual-oracle-bench
./scripts/reproduce_paper.sh
```

This runs: npm install, playwright chromium install, 4 unit test suites (primitives, oracles, llm_judge stubs, llama composite), and the 12-PNG offline smoke. Total wall clock: ~3-5 min on a fresh clone with cached chromium; ~10-15 min cold. Exits non-zero on any failure.

### Step 2 — Re-generate the 400-pair synthetic corpus (no Docker)

```bash
npx tsx scripts/capture_corpus.ts --offline-pipeline
npx tsx scripts/capture_pairs_manifest.ts
```

Produces `data/images/<app>/{baseline,defect}/*.png` (800 PNGs) plus `data/images/_pairs_manifest.json` (400 entries). Deterministic on each run.

### Step 3 — Re-run the LLM dispatch (requires subscriptions OR API keys)

```bash
# Default (subscription path, $0 cost):
#   - Requires Claude Code CLI authenticated via `claude login`
#   - Requires OpenAI Codex CLI authenticated via `codex login`
#   - Requires Ollama running with llama3.2-vision:11b pulled
npx tsx oracles/llm_judge/dispatcher.ts \
  --pairs data/images/_pairs_manifest.json \
  --judges openai-codex,claude-oauth,llama \
  --concurrency 3 \
  --out-dir results
```

Wall clock: ~30-50 min for 1,200 judgments at concurrency 3. Output: `results/judgments_<ts>.parquet` + `results/judgments_metadata.json`.

### Step 4 — Compute Phase 1 results

```bash
python3 -m venv .venv-analysis
.venv-analysis/bin/pip install pyarrow pandas numpy
.venv-analysis/bin/python3 analysis/analyze_judgments.py
```

Output: `analysis/results/phase1_analysis_<ts>.json` + `.md`. Bootstrap 1,000 resamples (seed 42 by default; override with `--seed`).

---

## 4. Mapping to manuscript sections

| Manuscript section | Backed by |
|---|---|
| §1 Introduction (contributions) | This ARTIFACTS.md + `manuscript/skeleton.md` lines 58-90 |
| §3.2 Application corpus (Phase 1 disclosure) | `manuscript/skeleton.md` lines 100-110, `data/images/` PNGs, `_pairs_manifest.json` |
| §3.3 Defect taxonomy | `injection/primitives.ts`, `manuscript/skeleton.md` lines 112-115 |
| §3.4 Oracles | `oracles/{pixel_diff,phash,llm_judge/dispatcher}.ts`, `manuscript/skeleton.md` lines 117-121 |
| §3.5 Ground truth | "By construction" — see §1 of this manifest and `_pairs_manifest.json` |
| §3.6 Analysis plan | `analysis/analyze_judgments.py`, `preregistration/draft.md` §6 |
| §4 Results (Phase 1 numbers) | `analysis/results/phase1_analysis_<ts>.{json,md}` |
| §6 Threats to validity | `manuscript/skeleton.md` §6.1-§6.5 |
| §7 Implications and reproducibility | This ARTIFACTS.md + `scripts/reproduce_paper.sh` |

---

## 5. Pre-registration timestamp evidence

The OSF pre-registration ([DOI 10.17605/OSF.IO/NKD6J](https://osf.io/nkd6j/)) was registered on **2026-06-06**. The first LLM judgment dispatch ran on **2026-06-06 19:50 PT** (after registration). The Llama re-run ran on **2026-06-09 22:16 UTC** (after registration). Reviewers can verify the timestamps at the OSF registration page.

The Phase 1 / Phase 2 split is explicitly NOT a pre-registration amendment: the OSF registration remains intact for what it registered (the 8-app live-Docker experiment, Phase 2). Phase 1 is a separately-framed methodological pilot of the harness infrastructure. See `manuscript/skeleton.md` lines 12-16 for the reporting-structure block.

---

## 6. Companion work in the same research program

| Paper | Status | Venue | Manuscript ID |
|---|---|---|---|
| Antecedent: Specification Enrichment (LLM-assisted design-to-test) | Under revision (not under submission) | — | — |
| Antecedent: Agent Harness for Cross-Layer Test Automation | Under submission | Journal of Systems and Software (Elsevier, "In Practice" track) | JSSOFTWARE-D-26-01260 |
| THIS PAPER: Visual Oracle Bench Phase 1 pilot | Under preparation | TBD (see venue rationale section in submission cover letter) | — |
| Phase 2 follow-up (pre-registered 8-app experiment) | Future | TBD | — |

Author affiliation: Suneet Malhotra is Senior Manager, Test Engineering at Motorola Solutions. **This work is independent of that role and uses only public infrastructure**; no proprietary systems, products, code, screenshots, data, or operational metrics are described.

---

## 7. Failure modes documented during Phase 1

These are the engineering surprises encountered during the methodological pilot, surfaced honestly to inform future LLM-as-Judge benchmark designers:

0. **Silent fabrication in the judge wrappers (the big one).** The original wrappers (commit `eaf1e4d`) converted provider rate-limit / auth-error responses into valid-looking `verdict=fail` rows with `malformed=false`; 617 of 1,200 comparable-judge rows across the pre-2026-06-10 parquets were fabricated this way and scored as correct detections on the defect-only corpus. Fixed in commits `9352483` + `da1f70a` (flag propagation + dispatcher fail-fast); retroactive detection in `analysis/analyze_judgments.py::_flag_silent_fabrications()` (4 signals: `MALFORMED` rationale prefix, empty rawResponse, `session limit`, `refresh_token`); Codex control top-up in commit `0745d7b` via `scripts/launch_full_dispatch_2026-06-11.sh`. The contaminated parquets are retained so the correction is independently auditable. Manuscript §3.5 + §6.1.

1. **Llama 3.2 Vision 11B refuses multi-image requests.** Discovered on 2026-06-06: dispatcher produced 400/400 malformed Llama judgments with rationale `"this model only supports one image while more than one image requested"`. Workaround: side-by-side composite via `sharp` (baseline LEFT, defect RIGHT, 4px divider, 28px label band). Implemented in `oracles/llm_judge/llama_ollama.ts:compositeBaselineAndDefect()`. Re-run on 2026-06-09 succeeded. Unit-tested in `tests/test_llama_composite_unit.ts`. Manuscript will report this as a Phase 1 methodological-pilot finding.

2. **Dispatcher overwrites metadata file per run.** The dispatcher writes a single `judgments_metadata.json` per invocation. Multi-run workflows lose prior metadata. Workaround: reconstruct from `logs/*.log` between runs; future fix is to version the metadata file by timestamp.

3. **Subscription-path judges have wildly different latencies.** Median latency in Phase 1 W7: Claude OAuth ≈ 1.6s; OpenAI Codex ≈ 5.7s; Llama (local Ollama vision) ≈ 18.8s (per 1-pair smoke). Concurrency-per-judge default 3 may be over-aggressive for Codex (subprocess overhead) and under-aggressive for Llama (single ollama runner instance is the bottleneck regardless). Future tuning is a methodological follow-up.

---

## 8. Versions pinned for reproducibility

| Component | Version | Where pinned |
|---|---|---|
| Node.js | ≥20.11.1 | `package.json` engines |
| Playwright | 1.58.0 | `package.json` |
| sharp (image composite) | ^0.34.5 | `package.json` |
| parquetjs-lite | ^0.8.7 | `package.json` |
| Llama 3.2 Vision | `llama3.2-vision:11b` (Ollama tag) | `oracles/llm_judge/llama_ollama.ts` PINNED_MODEL_ID |
| Claude (subscription path) | `claude-sonnet-4-5-20250929` (default; CLI-resolved at runtime) | metadata JSON per run |
| OpenAI (subscription path) | `gpt-5-codex` (default; env `VORACLE_OPENAI_MODEL_ID` override) | `oracles/llm_judge/openai_codex.ts` |
| Random seed (bootstrap CIs) | 42 (override with `--seed`) | `analysis/analyze_judgments.py` |

All model versions are also captured per-row in the parquet output's `modelVersion` column.

---

## 9. Contact

Suneet Malhotra · suneetmalhotra.com · ORCID 0009-0003-8707-9590 · suneetmalhotra2002@gmail.com
