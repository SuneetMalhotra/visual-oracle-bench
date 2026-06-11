# visual-oracle-bench

Pre-registered benchmark harness for LLM-as-Judge visual regression detection. Phase 1 (this cycle) is a two-judge, specificity-inclusive synthetic-HTML pilot; Phase 2 (deferred, pre-registered) targets live capture of 8 open-source web applications.

**Two-phase paper plan (companion manuscripts):**

- **Phase 1 — Methodological Pilot (THIS submission cycle).** Visual Oracle Bench harness + **600-pair synthetic-HTML corpus (400 defect pairs + 200 identical-image control pairs, manifest v2)**. Two comparable judges in the headline analysis (Claude Sonnet 4.5, OpenAI gpt-5-codex); one judge (Llama 3.2 Vision 11B) excluded from comparison for an input-modality confound and reported in the manuscript's Appendix A. Reports full confusion-matrix oracle metrics (sensitivity, specificity, precision, F1, MCC) against by-construction ground truth, pairwise Cohen's κ with bootstrap CIs, exact paired McNemar tests with Holm correction, and a catalog of integration failure modes — including the silent-fabrication wrapper bug documented under Data Integrity below.
- **Phase 2 — Pre-Registered 8-App Experiment (deferred to a later cycle).** The OSF-locked design: 8 live OSS web apps (Conduit, Mattermost, Excalidraw, GitLab CE, Rocket.Chat, Penpot, Cal.com, NocoDB) × 50 seeded defects × 6 categories = 800 image pairs evaluated by 4 pre-registered judges. Blocked on per-app Dockerfile debugging.

**Pre-registration:** [OSF DOI 10.17605/OSF.IO/NKD6J](https://osf.io/nkd6j/) — registered and locked 2026-06-06, BEFORE any LLM judgments were collected. The Phase 1 / Phase 2 split is explicitly NOT a pre-registration amendment: the OSF registration remains intact for what it registered (the 8-app live-Docker experiment, Phase 2). Phase 1 is a separately-framed methodological pilot of the harness infrastructure.

This benchmark is the external-validity follow-up to the single-application κ = 0.667 visual-assertion result reported in the antecedent agent-harness work ([github.com/SuneetMalhotra/agent-harness](https://github.com/SuneetMalhotra/agent-harness), v1.2.0). One companion manuscript from the same research line is currently under submission:

- **Agent Harness for Cross-Layer Test Automation** — Journal of Systems and Software (Elsevier, "In Practice" track, manuscript JSSOFTWARE-D-26-01260)

## Data Integrity

**Silent-fabrication discovery and correction (2026-06-10/11).** The original judge wrappers (commit `eaf1e4d`) silently converted provider rate-limit and auth-error responses into syntactically valid `verdict=fail` rows with `malformed=false`: `parseVerdictJson` returns a fallback object on unparseable output, and the wrappers' null-guard could never fire, so parse failures flowed through the success path. Across the three pre-2026-06-10 dispatch runs this fabricated **617 of 1,200 comparable-judge rows** (392 Claude, 225 Codex). On the defect-only portion of the corpus every fabricated `fail` scored as a correct detection, inflating the v1 draft's headline accuracy.

Correction, all released in this repository:

- **Wrapper patch** (commits `9352483`, `da1f70a`): the malformed flag now propagates, re-arming the dispatcher's retry-once path; a fail-fast gate aborts on consecutive-malformed streaks.
- **Retroactive detection** (`analysis/analyze_judgments.py::_flag_silent_fabrications()`): four signals — `MALFORMED` rationale prefix, empty raw response, `session limit` substring, `refresh_token` substring — re-flag affected rows as `malformed=True` at every analyzer run.
- **Targeted re-collection** (commit `0745d7b`): Codex top-up on the 200 control pairs (`data/images/_topup_codex_2026-06-11.json`), 0/200 malformed.
- **Auditability:** the contaminated original parquets are retained unmodified; deleting the filter reproduces the inflated v1 numbers, which is the point.

All reported metrics are computed on the integrity-audited subset (Claude n=208, Codex n=375 of 600 dispatched each).

## Status

- **2026-06-11 (Option B v1.6 — integrity-audited results).** Manifest v2 with 200 true-negative control pairs (`data/images/_pairs_manifest_v2.json`, 600 pairs total); silent-fabrication filter in the analyzer; Codex control top-up parquet landed. Headline (clean subset): Codex 87.5% acc / 73.1% recall / 100% spec (n=375); Claude 78.4% acc / 45.8% recall / 100% spec (n=208); κ=0.679 [0.565, 0.788] on n=208. Manuscript v1.6 (`manuscript/article3_phase1_v1_6.md`) retitled, Llama moved to Appendix A. Downstream verification needs no LLM calls: `python3 analysis/analyze_judgments.py && python3 analysis/paired_tests.py` regenerates every reported number from the released parquets.
- **2026-06-09 (Llama re-run + W8 analysis script written).** Phase 1 W7 dispatch (2026-06-06) revealed Llama 3.2 Vision 11B refuses multi-image requests. Patched the Llama judge (`oracles/llm_judge/llama_ollama.ts`) with a side-by-side composite workaround using `sharp`. Re-run dispatched 2026-06-09 against the same 400-pair manifest (~40 min wall clock at concurrency 3). W8 analysis pipeline written (`analysis/analyze_judgments.py`): pairwise Cohen's κ + Fleiss' κ + per-app + per-category + latency + cost; ready to consume both parquets once Llama re-run completes.
- **2026-06-06 (Phase 1 W7 dispatch initial run, 3-judge × 400 pairs = 1,200 judgments).** Dispatcher ran 29 min wall clock. Output: `results/judgments_2026-06-07T02-50-09-790Z.parquet`. Real result: 800 valid + 400 malformed (Llama integration bug — see 2026-06-09 entry). Phase 1 is methodological-pilot framing — see `manuscript/skeleton.md` Phase 1 / Phase 2 disclosure block.
- **2026-06-06 (W6 orchestrator ready).** W1-W5 + W7-infra deliverables in place. **W6 capture orchestrator ready** (`scripts/capture_corpus.ts` + `scripts/capture_pairs_manifest.ts` + per-app drivers under `capture/drivers/`); actual 800-PNG real-app capture deferred to a Docker-up session. The orchestrator is end-to-end-validated against a synthetic-HTML fixture: `npx tsx scripts/capture_corpus.ts --offline-pipeline` produces 400 baseline + 400 defect PNGs (50 per app × 8 apps) and per-app `_capture_ledger.json` files, then `npx tsx scripts/capture_pairs_manifest.ts` aggregates them into `data/images/_pairs_manifest.json` that `oracles/llm_judge/dispatcher.ts --pairs` consumes verbatim.
- **What works end-to-end today.** `scripts/reproduce_paper.sh` (offline suite: 6/6 primitives + 3 oracles + 6 judge stubs + 12-PNG offline smoke); `scripts/capture_corpus.ts --dry-run` (per-app plan); `scripts/capture_corpus.ts --offline-pipeline` (400 pairs against synthetic HTML); `scripts/capture_pairs_manifest.ts` (manifest); `npx tsx oracles/llm_judge/dispatcher.ts --pairs ... --dry-run` (would-issue plan for 1,600 LLM judgments / 4 default judges).
- **What is built but not yet executed against real apps.** `apps/{conduit,mattermost,excalidraw,gitlab-ce,rocket-chat,penpot,cal-com,nocodb}/` Docker stacks and the 8 smoke pipelines + 8 per-app capture drivers (`capture/drivers/<app>.ts`) -- blocked on a Docker-up session. Build+run sequences documented in each app's `RUNBOOK.md`; the W6 orchestrator contract (compose service names, healthcheck command, seed invocation, capture-loop expectations) is documented under "Called from `scripts/capture_corpus.ts`" in `apps/conduit/RUNBOOK.md` and `apps/mattermost/RUNBOOK.md` and applies identically to the other 6.
- **Real-app capture (W6) prerequisites.** Docker daemon up; Ollama with `ollama pull llama3.2-vision:11b` (~7 GB) for the Llama judge; Claude OAuth + OpenAI Codex subscriptions active for the default subscription-path judges (API-key variants available via `--judges gpt4o,claude,gemini,llama`).
- **OSF pre-registration:** [draft](preregistration/draft.md) is submission-ready pending 3 flagged items (§12 of the draft); target OSF submission **2026-06-19** (W2 hard milestone).
- **v1.0.0 release with full data and code:** target **2026-09-27** (W16, before EMSE submission 2026-09-30).

## Design (locked at OSF pre-registration)

- **Sample:** 8 OSS web apps × 50 seeded defects/app × 6 categories (layout, color, missing, truncation, z-order, contrast) = **400 defect images + 400 baselines = 800 image pairs**.
- **Oracles:** pixel SSIM + perceptual hash + LLM-as-judge.
- **LLM judges:** GPT-4o, Claude Sonnet 4.5, Gemini 2.5 Pro, Llama 3.2 Vision (local Ollama).
- **Total judgments:** ~11,200 (1,600 deterministic + 9,600 LLM).
- **Ground truth:** sole-author 100%; 10% double-coded by 2 colleagues; inter-rater Fleiss' κ reported.
- **Stats:** mixed-effects logistic regression (lme4) with random intercepts for app + defect-category; McNemar's pairwise; Cohen's κ with bootstrap CIs.

## Layout

```
visual-oracle-bench/
├── README.md                         # this file
├── LICENSE                           # MIT (code)
├── LICENSE-DATA                      # CC-BY 4.0 (data/images, judgments, ground truth)
├── package.json + tsconfig.json      # TypeScript / Playwright toolchain
├── preregistration/draft.md          # OSF pre-registration draft (lock status in §12)
├── manuscript/skeleton.md            # section-level outline for W13-W14 author prose
├── apps/                             # 8 app subdirs (Conduit reference, W2)
│   ├── README.md
│   └── conduit/                      # Dockerfile, docker-compose.yml, seed.sh, injection-points.yaml, RUNBOOK.md
├── injection/                        # 6 defect-category mutation primitives (W2: implemented)
│   ├── primitives.ts                 # shift_element, mutate_color, remove_element,
│   │                                 # shrink_container, swap_zindex, reduce_contrast
│   └── source-seedings-todomvc.ts    # ported antecedent reference catalog
├── capture/source-render-todomvc.ts  # ported antecedent renderer (template for app captures)
├── oracles/                          # W7-W8: pixel diff + pHash + LLM-as-judge harness
├── analysis/source-analysis-kappa.py # ported Cohen's κ + mixed-effects scaffolding
├── data/images/                      # W6-W7 corpus output; _offline_smoke/ holds W2 demo PNGs
├── figures/                          # generated PDFs (W10-W12)
├── tests/
│   ├── test_primitives_unit.ts       # unit-tests the 6 primitives against synthetic DOM
│   ├── smoke_offline_pipeline.ts     # offline 12-PNG end-to-end proof (no docker)
│   └── smoke_<app>_pipeline.ts       # real-app 12-PNG end-to-end (one per app, requires docker)
├── capture/
│   ├── per_app.ts                    # shared capture loop (used by W6 orchestrator)
│   └── drivers/<app>.ts              # per-app driver (auth + navigate + healthcheck)
└── scripts/
    ├── reproduce_paper.sh            # one-shot offline reproduction (no docker)
    ├── capture_corpus.ts             # W6 corpus capture orchestrator
    ├── offline_capture_pipeline.ts   # `--offline-pipeline` mode for capture_corpus
    └── capture_pairs_manifest.ts     # W6 aggregate per-app ledgers -> dispatcher manifest
```

## Quickstart

```bash
# 1. Offline-only reproduction (no docker, no subscriptions, no API keys)
#    Installs deps + runs all 4 offline test suites + the 12-PNG offline smoke.
./scripts/reproduce_paper.sh

# 2. (No docker, no real apps) Drive the W6 capture loop end-to-end against a
#    synthetic HTML fixture: produces 800 PNG files (400 baseline + 400 defect,
#    50 per app × 8 apps) plus 8 per-app capture ledgers + a cross-app manifest.
#    Proves the orchestrator wiring works without Docker.
npx tsx scripts/capture_corpus.ts --offline-pipeline
npx tsx scripts/capture_pairs_manifest.ts

# 3. (Requires docker) Bring up Conduit and run the 6-point demo smoke test
docker compose -f apps/conduit/docker-compose.yml up --build -d
./apps/conduit/seed.sh
npx tsx tests/smoke_conduit_pipeline.ts        # -> data/images/conduit/
docker compose -f apps/conduit/docker-compose.yml down -v

# 4. (Requires docker + Ollama llama3.2-vision:11b + subscriptions) Full W6 + W7
npx tsx scripts/capture_corpus.ts              # all 8 apps, all 50 points each
npx tsx scripts/capture_pairs_manifest.ts      # data/images/_pairs_manifest.json
npm run oracles:judge:dispatch -- --pairs data/images/_pairs_manifest.json
```

## Reproducibility commitments

- Pre-registered protocol on OSF before any LLM judgments are collected.
- LLM provider versions pinned at run time.
- All random seeds stated.
- Single-command end-to-end reproduction at v1.0.0 release tag.
- Image corpus mirrored to Zenodo (concept DOI 10.5281/zenodo.20620870; version DOI 10.5281/zenodo.20620871 covers tag `v0.3.0-phase1-pilot`; a new version DOI for tag `v1.6.1-emse-option-b` is minted at submission and substituted into the manuscript by `scripts/mint_zenodo_doi.py`).

## License

- Code (`*.py`, `*.ts`, `*.sh`, `*.r`, `*.ipynb`, config) is licensed under the MIT License — see [LICENSE](LICENSE).
- Data files in `data/`, generated images in `data/images/`, ground-truth labels, and judgment logs are licensed under Creative Commons Attribution 4.0 International (CC-BY 4.0) — see [LICENSE-DATA](LICENSE-DATA).
- © 2026 Suneet Malhotra.

## Disclosure

The author is Senior Manager, Test Engineering at Motorola Solutions. This benchmark and the accompanying manuscript reflect the author's independent professional research and do not describe any specific employer's systems, products, code, or data. All applications evaluated are publicly available open-source projects; all data is synthetic seeded defects on those public applications.
