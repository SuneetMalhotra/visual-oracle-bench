# OSF Pre-Registration — Visual Oracle Bench
**Project:** Multi-Application Empirical Evaluation of LLM-as-Judge Visual Regression Detection Across Open-Source Web Applications
**Author:** Suneet Malhotra (sole author)
**Affiliation:** independent practitioner (Sr. Manager Test Engineering, Motorola Solutions — affiliation for identification only)

**REGISTERED:** 2026-06-06 — [OSF DOI 10.17605/OSF.IO/NKD6J](https://osf.io/nkd6j/)
**OSF Project:** https://osf.io/jp2rx/
**Manuscript target submission to EMSE (Empirical Software Engineering, Springer):** 2026-09-30

This draft was the source of the OSF registration content; the live registration at the DOI above is the immutable authoritative version.

---

## 1. Background and rationale

A prior single-application study (Malhotra 2026, *An Agent Harness for Test Automation*, JSS submission pending) reported a vision-based LLM-as-judge visual-assertion service achieving Cohen's κ = 0.667 against a 24-image seeded ground truth on a public TodoMVC web application. The κ measurement was an artifact of the agent harness's three-tier intelligence layer; the study did not address external validity. This pre-registration locks the design of a multi-application replication and external-validity study.

## 2. Research questions

**RQ1 (primary).** Does the κ = 0.667 visual-assertion accuracy reported on TodoMVC generalize to a multi-application web corpus, and does aggregate accuracy across applications differ from the single-application baseline by a non-trivial effect size?

**RQ2 (secondary).** Do application characteristics (UI density, framework type, presence of canvas/SVG rendering, viewport responsiveness profile) predict accuracy degradation when measured as random intercepts in a mixed-effects model?

**RQ3 (secondary).** Do defect categories differ systematically in detectability across the four LLMs evaluated, and is at least one LLM strictly Pareto-dominant across the cost-accuracy frontier?

**RQ4 (methodological).** Does inter-LLM Cohen's κ on the same image pairs correlate with LLM-vs-human Cohen's κ measured against author-coded ground truth, controlling for image-level difficulty?

## 3. Hypotheses (directional, pre-specified)

- **H1.** Mean per-application κ across the 8-app corpus will be ≤0.55 (a non-trivial drop from the 0.667 TodoMVC baseline), reflecting external-validity attrition.
- **H2.** Per-application κ variance will be larger than per-defect-category κ variance, indicating that application-level UI characteristics dominate over defect-category effects.
- **H3.** Vision-LLM oracles (GPT-4o, Claude Sonnet 4.5, Gemini 2.5 Pro, Llama 3.2 Vision) will collectively achieve recall ≥0.55 on functional defects against the pixel-comparison baseline of ~0.50 reported in the antecedent TodoMVC study.
- **H4.** Inter-LLM κ on the same image pairs will be ≥0.40 lower than LLM-vs-human κ — replicating and generalizing the negative observation reported in the antecedent TodoMVC study (LLM-vs-LLM κ = −0.059).

## 4. Design

### 4.1 Corpus

- **Sample units:** 8 open-source web applications, deliberately selected for diversity across application class, framework, and rendering paradigm.
- **Applications:** RealWorld Conduit, Mattermost, Excalidraw, GitLab CE, Rocket.Chat, Penpot, Cal.com, NocoDB.
  - All distributed under OSS licenses permitting research use; all containerizable via official Docker images at pinned digests.
- **Substitution rule (FINAL, per §12 Decision C):** If any of the 8 apps cannot be onboarded, drop in priority order: (1) NocoDB, (2) Penpot. If both drops occur and the sample falls to 6 apps, the analysis proceeds with 6 apps and the §6.1 Threats section reports the reduced sample. If a third drop is required, add **Vue Storefront** (`https://github.com/vuestorefront/vue-storefront`, Apache-2.0) as backup #3 to maintain a 6-app minimum (Vue Storefront adds e-commerce-class + Vue-framework diversity to the corpus). If Vue Storefront also fails, proceed with N=5 and disclose. All substitutions documented in the manuscript with reasoned justification.

### 4.2 Defect catalog

- **6 defect categories** (operationalized as injection primitives — see `injection/primitives.ts`):
  - `layout` — element bounding box shift ≥8 px on any axis
  - `color` — foreground or background hue shift ≥15° in HSL
  - `missing` — visible interactive element removed from DOM
  - `truncation` — text overflow without ellipsis, or ellipsis where full text was visible
  - `zorder` — element rendered in front of element it should be behind
  - `contrast` — text/background contrast drops below WCAG AA (4.5:1)
- **Defects per app:** 50, distributed across categories as 8/8/8/8/9/9.
- **Total defect images:** 400.
- **Baseline (clean) images:** 400, paired one-to-one with defect images.
- **Viewports per image:** 2 (1440×900 desktop, 375×667 mobile).
- **Total image files captured:** 1600 (800 image pairs × 2 viewports).
- **Total image PAIRS used as evaluation units in primary analysis:** 800 (one viewport per pair selected by stratified random sample per app, with the other viewport reserved for a sensitivity analysis).

### 4.3 Oracles

- **O1 — pixel diff:** structural similarity (SSIM) with threshold pre-specified as the value that maximizes F1 on a held-out calibration set of 80 pairs.
- **O2 — perceptual hash:** dHash with Hamming-distance threshold pre-specified by the same calibration procedure.
- **O3 — LLM-as-judge:** the visual-assertion prompt ported from the antecedent agent-harness `intelligence.ts: VISUAL_ASSERTION_VISION_SYSTEM` (committed verbatim at `oracles/llm_judge/prompt.txt` in this repo's release). The prompt instructs the model to output a single-line JSON verdict.

### 4.4 LLM judges

Four models exercised under the LLM-as-judge oracle. Model versions pinned in the manuscript and at the release tag:
**Access mode (per §12 Decision A and Decision D):** the harness ships TWO access paths per judge: (i) API-key-based (legacy; reviewer supplies `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GOOGLE_API_KEY`) and (ii) OAuth/subscription-based (no API keys; uses Claude OAuth via `claude -p` subprocess and OpenAI ChatGPT/Codex subscription via `codex exec` subprocess). The author's primary run uses the OAuth/subscription paths, which is the default in the dispatcher CLI. The reviewer can swap to API-key paths via `--judges gpt4o,claude,gemini,llama` if preferred. Both paths produce identical `JudgeResponse` schema and are scored identically.

- **OpenAI GPT (Codex CLI path, primary):** pinned at W7 first-judgment run per §12 Decision A (Codex CLI's served model rotates with OpenAI product updates; cannot retroactively pin a frozen snapshot via subscription). Default `gpt-5-codex`; overrideable via env `VORACLE_OPENAI_MODEL_ID`. Exact resolved identifier captured in `results/judgments_metadata.json`.
- **OpenAI GPT-4o (API-key path, alternate):** pinned identifier `gpt-4o-2024-11-20`. Available when reviewer supplies `OPENAI_API_KEY`.
- **Claude Sonnet 4.5 (OAuth path, primary):** pinned at W7 first-judgment run per §12 Decision A (Claude OAuth subscription serves the current Sonnet release; cannot retroactively pin via subscription). Default `claude-sonnet-4-5`; overrideable via env `VORACLE_CLAUDE_MODEL_ID`. Exact resolved identifier captured in `results/judgments_metadata.json`.
- **Claude Sonnet 4.5 (API-key path, alternate):** pinned identifier `claude-sonnet-4-5-20250929`. Available when reviewer supplies `ANTHROPIC_API_KEY`.
- **Gemini 2.5 Pro:** pinned at W7 first-judgment run per §12 Decision A. Free-tier API access expected to cover the full N=2,400 judgments. Default `gemini-2.5-pro-latest`; overrideable via env `VORACLE_GEMINI_MODEL_ID`. Exact resolved identifier captured in `results/judgments_metadata.json`.
- **Llama 3.2 Vision** — pinned identifier `llama3.2-vision:11b`, served via local Ollama. No version-rotation risk; pinned by Ollama tag.

### 4.5 Total judgment volume

- 800 image pairs × 3 oracle classes × 4 LLM-judge sub-instances = **9,600 judgments** under the LLM-as-judge oracle; 800 × 2 deterministic oracle runs = **1,600 judgments** under pixel + pHash.
- Aggregate: ~11,200 oracle judgments.

### 4.6 Ground truth

- **Primary:** sole author hand-codes 100% of 800 image pairs as `{defect_present: yes|no, defect_category: layout|color|missing|truncation|zorder|contrast, confidence: high|medium|low}`. Author coding conducted in 90-minute blocks to mitigate fatigue drift.
- **Secondary:** stratified random subsample of 80 image pairs (10%) double-coded by two additional volunteer raters, who are not co-authors and have no prior collaboration with the author on this manuscript. Raters receive the codebook and a 10-image calibration set before coding the 80-pair subsample. Inter-rater Cohen's κ computed across the 3 coders (Fleiss' κ for 3-way agreement). Disagreement resolution by pre-specified protocol: any pair where ≥1 rater disagrees with the author triggers a three-way discussion; if no consensus, the pair is reported as "unresolved" and excluded from the primary analysis with sensitivity check.
- **Fleiss' κ failure floor (FINAL, per §12 Decision B):** if Fleiss' κ across the 3 coders falls below **0.60** on the 80-pair subsample, the coding scheme is declared unreliable for the analysis as-pre-registered. Remediation: (1) the author re-runs calibration with an expanded 20-image calibration set incorporating exemplars from the disagreement region; (2) all 80 pairs are re-coded by all three coders against the revised codebook; (3) Fleiss' κ is recomputed. One re-calibration cycle maximum. If Fleiss' κ remains below 0.60 after re-calibration, the manuscript reports the failure transparently and the inter-rater analysis is moved from §5.1 Primary to §5.3 Exploratory with full disclosure.

## 5. Analysis plan

### 5.1 Primary analyses (pre-registered)

1. **Per-LLM-judge per-application Cohen's κ** against author-coded ground truth. Reported as a 4 × 8 matrix with 95% bootstrap CIs (1000 resamples, BCa). Confirmatory of H1.
2. **Mixed-effects logistic regression.** Outcome: LLM-judge agreement with ground truth (binary). Fixed effect: LLM identity (4 levels). Random effects: application (random intercept), defect category (random intercept). Fit in R with `lme4::glmer` (logit link). Convergence diagnostic: singular-fit warnings reported and addressed by `optimx` re-fits or simplified random-effect structure with explicit documentation. Confirmatory of H2.
3. **McNemar's pairwise tests** between each oracle pair (LLM-as-judge vs. pixel; LLM-as-judge vs. pHash; pairwise between LLMs). Confirmatory of H3.
4. **Inter-rater agreement (LLM-LLM).** Pairwise Cohen's κ across the 4 LLMs on all 800 image pairs (6 pairwise comparisons + Fleiss' overall). Correlated with LLM-vs-human κ via Spearman ρ on the 80-pair subsample. Confirmatory of H4.

### 5.2 Sensitivity analyses (pre-registered, not exploratory)

- Re-run primary analysis on the held-out viewport (mobile 375×667 instead of desktop 1440×900).
- Re-run primary analysis with the alternative SSIM threshold derived by Youden's J on the calibration set.
- Re-run primary analysis with rater-disagreement-excluded subset.
- Pre-specified subgroup analyses: by defect-category, by application-class (chat, productivity, code-host, design-canvas).

### 5.3 Exploratory analyses (clearly labeled as such in manuscript)

- Cost-accuracy Pareto frontier across LLMs.
- Image-level difficulty regression: which images do all 4 LLMs disagree with ground truth on?
- Provider-stability check: re-run a random 100-image subsample against the same prompts 30 days later; report intra-model κ drift.

## 6. Exclusion rules (pre-specified)

- Any image pair where the rendering script reports a non-deterministic warning (e.g., font fallback, network-resource timeout) is excluded from the analysis sample and re-rendered. Maximum 5 re-renders per pair; further failures recorded as "non-renderable" and excluded with reasoned documentation in the manuscript.
- Any LLM judgment where the response is malformed (does not produce parseable single-line JSON with `verdict` field after one retry) is recorded as "malformed" and treated as missing data. Maximum malformed rate per LLM per oracle: 5%; if exceeded, that LLM-judge cell is excluded from primary analysis with reason.
- Applications where fewer than 5 defects per category can be injected (because the UI lacks the relevant surface — e.g., contrast violations on a primarily black-and-white app) are noted; defect targets are re-balanced within the 50-per-app budget with the imbalance documented.

## 7. Reproducibility commitments

- All code MIT-licensed at `github.com/SuneetMalhotra/visual-oracle-bench`.
- All data (image corpus, judgment logs, ground-truth labels) CC-BY 4.0 licensed, archived at Zenodo with DOI minted at manuscript submission (~W14).
- All LLM provider versions pinned and reported.
- All random seeds for stratified sampling, SSIM threshold calibration, and bootstrap CIs reported.
- Pre-registration timestamped on OSF before any LLM judgments are collected.
- A single end-to-end reproduction script (`scripts/reproduce.sh`) ships at the v1.0.0 release tag.

## 8. Timeline

| Week | Date range | Milestone |
|---|---|---|
| W1 | Jun 8 – Jun 14 | OSF account + pre-reg draft; repo skeleton; Cohen's κ utilities ported |
| W2 | Jun 15 – Jun 21 | Taxonomy operationalized; Conduit injection working; **OSF pre-reg submitted Jun 19** |
| W3 | Jun 22 – Jun 28 | Mattermost + Excalidraw onboarded |
| W4 | Jun 29 – Jul 5 | GitLab CE + Rocket.Chat onboarded |
| W5 | Jul 6 – Jul 12 | Penpot + Cal.com + NocoDB onboarded; first 200 screenshots captured |
| W6 | Jul 13 – Jul 19 | All 800 screenshots captured |
| W7 | Jul 20 – Jul 26 | Pixel + pHash oracles run; GPT-4o judgment batch 1 |
| W8 | Jul 27 – Aug 2 | All 9,600 LLM judgments complete |
| W9 | Aug 3 – Aug 9 | Ground truth lock; colleague raters recruited |
| W10 | Aug 10 – Aug 16 | Statistical analysis complete |
| W11 | Aug 17 – Aug 23 | Colleague reconciliation; sensitivity analyses |
| W12 | Aug 24 – Aug 30 | Figures + tables frozen |
| W13 | Aug 31 – Sep 6 | Manuscript drafting begins (author writes; no AI prose) |
| W14 | Sep 7 – Sep 13 | Manuscript v1 complete |
| W15 | Sep 14 – Sep 20 | Internal review |
| W16 | Sep 21 – Sep 27 | Revisions; **EMSE submission by Wed Sep 30** |

## 9. Conflicts of interest, funding, attribution

- Author affiliation: Motorola Solutions (Sr. Manager Test Engineering). This work is independent research; no Motorola Solutions data, code, customer information, or operational metrics are used. Author submits in personal capacity; affiliation included for identification only per OSF and EMSE conventions.
- Funding: none. Self-funded.
- No conflicts of interest with EMSE editorial board or with named OSS application maintainers.

## 10. What this pre-registration does NOT lock

- The exact thresholds for pixel SSIM and pHash dHash (these are calibrated empirically and the calibration procedure is pre-specified, but the threshold values themselves are not pre-stated).
- The 80-pair subsample identifiers (stratified random sample drawn after image capture; seed pre-specified below).
- The two colleague raters' identities (will be acknowledged in manuscript after their consent).
- Manuscript prose itself (per author's separate authorial-integrity commitment).

## 11. Pre-specified random seeds and operational parameters

- **Calibration set draw seed:** `numpy.random.seed(20260619)` for the 80-pair held-out SSIM/pHash threshold-calibration sample, drawn stratified by app (10 per app).
- **Primary-sample viewport assignment seed:** `numpy.random.seed(20260620)` for the desktop-vs-mobile viewport selection per pair (one viewport used for primary analysis, the other reserved for sensitivity).
- **Bootstrap CI seed:** `numpy.random.seed(20260621)`, 1000 BCa resamples per κ estimate.
- **Image-pair presentation order for human coding:** Fisher-Yates shuffle with seed `20260622`, applied independently per coder to break any defect-injection-order regularity that could leak ground-truth.
- **Re-run subsample for provider-stability check:** `numpy.random.seed(20260623)`, 100 pairs drawn stratified by app + category, executed at T+30 days after first run.
- **Stratification axes for all random draws:** application × defect-category. No further axes (e.g., framework) used as strata.
- **Statistical software pin:** R 4.4.x (latest patch at run time); `lme4` 1.1-x; Python 3.11.x; `numpy` 1.26.x; `scikit-image` 0.24.x for SSIM. Versions frozen at the W7 first-analysis run and reported in manuscript.

## 12. Lock status (FINAL — all items resolved 2026-06-06; pre-registration is submission-ready)

**Locked and submission-ready:**
- §1 Background, §2 RQs, §3 Hypotheses (H1–H4 directional, magnitudes specified).
- §4.2 Defect catalog (6 categories, 50/app split 8/8/8/8/9/9, dual viewport).
- §4.4 LLM judge list (4 models; version-pin policy now locked, see Decision A below).
- §4.5 Total judgment volume (~11,200).
- §4.6 Ground truth and inter-rater protocol (Fleiss' κ floor now locked, see Decision B below).
- §4.1 Application corpus + substitution rule (Decision C below).
- §5.1 Primary analyses, §5.2 sensitivity analyses, §5.3 exploratory analyses.
- §6 Exclusion rules (3 rules, all pre-specified with thresholds).
- §11 Random seeds (all 5 seeds pre-stated).

**Resolved items (rationale per decision):**

**Decision A — Version-pin policy for subscription-served models (Gemini, OpenAI Codex, Claude OAuth).** Pre-register the "version-at-run-time" policy with mandatory reporting in the manuscript. Specifically: for any LLM judge accessed via a subscription channel that rotates its served model (Gemini API, OpenAI ChatGPT/Codex CLI, Anthropic Claude OAuth via `claude -p`), the exact model identifier resolved at the W7 first-judgment run is captured verbatim into `results/judgments_metadata.json` and quoted in the manuscript §4.4 table. The OSF entry commits to the policy, not a specific weight; the manuscript commits to the specific weight used. Rationale: subscription channels do not expose retroactively-resolvable frozen snapshots; locking a placeholder identifier now risks documenting a model that has been retired by submission/revision time. The API-key access paths for GPT-4o (`gpt-4o-2024-11-20`) and Claude Sonnet 4.5 (`claude-sonnet-4-5-20250929`) DO support frozen snapshots and remain pinned by exact identifier in §4.4. Llama 3.2 Vision (`llama3.2-vision:11b`) is pinned by exact Ollama tag.

**Decision B — Fleiss' κ failure floor.** Pre-register **Fleiss' κ ≥ 0.60** across the three coders on the 80-pair subsample as the inter-rater reliability floor. If the observed Fleiss' κ falls below 0.60: (1) the coding scheme is declared unreliable for the analysis as-pre-registered; (2) the author re-runs calibration with an expanded 20-image calibration set (up from 10), incorporating exemplars from the disagreement region; (3) all 80 pairs are re-coded by all three coders against the revised codebook; (4) Fleiss' κ is recomputed. If Fleiss' κ remains below 0.60 after one re-calibration cycle, the manuscript reports the coding-scheme failure transparently and the inter-rater analysis is moved from §5.1 Primary to §5.3 Exploratory with full disclosure. Rationale: 0.60 is the Landis & Koch "substantial agreement" threshold and matches the floor the antecedent agent-harness work (§6 of Malhotra 2026) uses for citation-quality. One re-calibration cycle is the standard SE-empirical norm (Wohlin et al.); unbounded re-coding cycles would license researcher-degree-of-freedom inflation.

**Decision C — Substitution-rule extension (third-backup application).** Pre-register **Vue Storefront** (`https://github.com/vuestorefront/vue-storefront`, Apache-2.0 license) as backup app #3, after NocoDB (drop #1) and Penpot (drop #2). If all three primary drops occur and the sample falls to 5 apps, Vue Storefront is added as the 6th app to maintain a 6-app minimum. Rationale: Vue Storefront adds e-commerce-class diversity (currently absent from the 8-app corpus, which skews toward chat/canvas/code-host); is Vue-framework (different from the React-heavy primary list, additional framework-paradigm coverage); and is well-documented for testing automation. If Vue Storefront also fails onboarding, the manuscript proceeds with N=5 apps and the §6.1 Threats to Validity section reports the reduced sample with reasoned acknowledgment.

**Decision D — LLM judge access mode (OAuth/subscription as primary path).** Pre-register that the author's primary W7 judgment run uses OAuth/subscription-based access to Claude (`claude -p` subprocess) and OpenAI (`codex exec` subprocess) — NOT API keys — per the author's standing policy (CLAUDE.md global preference). Rationale: the author holds Claude Max and OpenAI ChatGPT/Codex subscriptions that cover the full N=2,400-per-judge volume at $0 marginal cost; the API-key paths (`gpt-4o-2024-11-20` and `claude-sonnet-4-5-20250929` with frozen snapshots) remain available in the harness for any reviewer who prefers to reproduce against the frozen snapshots and is willing to provide API keys. Both paths produce identical `JudgeResponse` schemas. The dispatcher's default judge list is `openai-codex,claude-oauth,gemini,llama`; the API-key variant `gpt4o,claude,gemini,llama` is opt-in via `--judges`. The manuscript §4.4 reports BOTH the access mode used and the exact model identifier resolved at first-judgment run; reviewers can reproduce via either path.

---

**Next action:** transcribe this draft into OSF's structured pre-registration form (uses the OSF SE/Empirical SE template). All hypotheses, design parameters, analysis plan, exclusion rules, and substitution rules are now locked. Submission is unblocked.
