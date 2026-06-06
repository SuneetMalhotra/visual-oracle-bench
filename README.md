# visual-oracle-bench

Multi-application empirical benchmark for LLM-as-judge visual regression detection across 8 open-source web applications.

Companion infrastructure for the manuscript:

> Malhotra, S. *Beyond TodoMVC: A Multi-Application Empirical Evaluation of LLM-as-Judge Visual Regression Detection Across 8 Open-Source Web Applications*. Empirical Software Engineering (target submission 2026-09-30).

This benchmark is the external-validity follow-up to the single-application κ = 0.667 visual-assertion result reported in the antecedent agent-harness work ([github.com/SuneetMalhotra/agent-harness](https://github.com/SuneetMalhotra/agent-harness), v1.2.0).

## Status

- **2026-06-06 (W3 complete).** W1 + W2 + W3 deliverables in place. W1: repo skeleton, OSF draft, manuscript skeleton, ported source assets, MIT + CC-BY-4.0 license split. W2: 6 injection primitives implemented and unit-tested (6/6 passing), Conduit Docker stack pinned to upstream commit SHAs, 50 defect injection points per app, end-to-end smoke pipeline. **W3: Mattermost and Excalidraw onboarded** following the apps/conduit/ template — Dockerfile/docker-compose pinned by image digest, seed script (Mattermost) and TS fixture loader (Excalidraw), 50 injection points each (8/8/8/8/9/9), RUNBOOK with bring-up + known risks, smoke pipeline per app.
- **What works end-to-end today.** `injection/primitives.ts` + `tests/test_primitives_unit.ts` (6/6 pass) + `tests/smoke_offline_pipeline.ts` (12 PNGs proving baseline vs. defect deltas are visible).
- **What is built but not yet executed.** `apps/conduit/`, `apps/mattermost/`, `apps/excalidraw/` Docker stacks and the three smoke pipelines (`tests/smoke_{conduit,mattermost,excalidraw}_pipeline.ts`) — blocked on a machine with Docker installed (the W2 + W3 dev machine has none). Build+run sequences documented in each app's `RUNBOOK.md`. Selectors in `injection-points.yaml` for Mattermost and Excalidraw are inferred from upstream class-name conventions at the pinned SHA and require one-shot post-build verification (per the "Known risks" section of each RUNBOOK).
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
│   └── smoke_conduit_pipeline.ts     # real-Conduit 12-PNG end-to-end (requires docker)
└── scripts/                          # W16: run_all.sh, reproduce.sh
```

## Quickstart (W2 — what runs today)

```bash
# 1. Install deps (Node >= 20.11.1)
npm install
npx playwright install chromium

# 2. Run primitive unit tests (no docker required) -- expect 6/6 pass
npx tsx tests/test_primitives_unit.ts

# 3. Run the offline pipeline smoke test (no docker required)
#    Produces 12 baseline-vs-defect PNGs in data/images/_offline_smoke/
npx tsx tests/smoke_offline_pipeline.ts

# 4. (Requires docker) Bring up Conduit and run the real-app smoke test
docker compose -f apps/conduit/docker-compose.yml up --build -d
./apps/conduit/seed.sh
npx tsx tests/smoke_conduit_pipeline.ts        # -> data/images/conduit/
docker compose -f apps/conduit/docker-compose.yml down -v
```

## Reproducibility commitments

- Pre-registered protocol on OSF before any LLM judgments are collected.
- LLM provider versions pinned at run time.
- All random seeds stated.
- Single-command end-to-end reproduction at v1.0.0 release tag.
- Image corpus mirrored to Zenodo (DOI minted at submission).

## License

- Code (`*.py`, `*.ts`, `*.sh`, `*.r`, `*.ipynb`, config) is licensed under the MIT License — see [LICENSE](LICENSE).
- Data files in `data/`, generated images in `data/images/`, ground-truth labels, and judgment logs are licensed under Creative Commons Attribution 4.0 International (CC-BY 4.0) — see [LICENSE-DATA](LICENSE-DATA).
- © 2026 Suneet Malhotra.

## Disclosure

The author is Senior Manager, Test Engineering at Motorola Solutions. This benchmark and the accompanying manuscript reflect the author's independent professional research and do not describe any specific employer's systems, products, code, or data. All applications evaluated are publicly available open-source projects; all data is synthetic seeded defects on those public applications.
