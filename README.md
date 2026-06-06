# visual-oracle-bench

Multi-application empirical benchmark for LLM-as-judge visual regression detection across 8 open-source web applications.

Companion infrastructure for the manuscript:

> Malhotra, S. *Beyond TodoMVC: A Multi-Application Empirical Evaluation of LLM-as-Judge Visual Regression Detection Across 8 Open-Source Web Applications*. Empirical Software Engineering (target submission 2026-09-30).

This benchmark is the external-validity follow-up to the single-application κ = 0.667 visual-assertion result reported in the antecedent agent-harness work ([github.com/SuneetMalhotra/agent-harness](https://github.com/SuneetMalhotra/agent-harness), v1.2.0).

## Status

- **2026-06-06:** Repository created. W1 of 16 in progress.
- **OSF pre-registration:** [draft](preregistration/draft.md); target OSF submission **2026-06-19** (W2 milestone, before any LLM judgments are collected).
- **v1.0.0 release with full data and code:** target **2026-09-27** (W16, before EMSE submission).

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
├── preregistration/                  # OSF pre-registration documents
├── apps/                             # 8 app subdirs: Dockerfile, seed scripts, injection points
├── injection/                        # 6 defect-category mutation primitives
├── capture/                          # Playwright screenshot capture, dual viewport
├── oracles/                          # pixel diff, perceptual hash, LLM-as-judge harness
├── analysis/                         # Cohen's κ, mixed-effects regression, sensitivity
├── data/                             # judgments, ground truth (images → Zenodo at submission)
├── figures/                          # generated PDFs from analysis notebooks
├── tests/                            # pytest for injection + oracle code
└── scripts/                          # run_all.sh, reproduce.sh
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
