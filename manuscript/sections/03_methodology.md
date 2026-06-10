# 3 Methodology

This study follows a pre-registered, two-phase reporting structure. Phase 1 is a methodological pilot that exercises the benchmark harness end-to-end against a deterministic synthetic-HTML fixture and reports infrastructure-validation evidence only. Phase 2 is the pre-registered experiment over a live-Docker capture of eight open-source web applications; Phase 2 is deferred at submission time and answers the four pre-registered research questions. The full design, hypotheses, sample, analysis plan, and exclusion rules were registered with the Open Science Framework on 2026-06-06, prior to the collection of any LLM judgment, at OSF DOI [10.17605/OSF.IO/NKD6J](https://osf.io/nkd6j/) (Malhotra 2026, Pre-Registration). Both phases share the same injection primitives, manifest contract, oracle dispatcher, prompt, and judges; they differ in the corpus generation step and in whether per-application labels reflect live-application screenshots. The empirical-software-engineering methodology grounding throughout this section follows Wohlin et al. (2012), with κ interpretation per Landis and Koch (1977).

## 3.1 Research questions and hypotheses

The four pre-registered research questions and four directional hypotheses are restated verbatim from the OSF pre-registration §2–§3 (Malhotra 2026, Pre-Registration):

- **RQ1 (primary).** Does the κ = 0.667 visual-assertion accuracy reported on TodoMVC generalize to a multi-application web corpus, and does aggregate accuracy across applications differ from the single-application baseline by a non-trivial effect size?
- **RQ2 (secondary).** Do application characteristics (UI density, framework type, presence of canvas/SVG rendering, viewport responsiveness profile) predict accuracy degradation when measured as random intercepts in a mixed-effects model?
- **RQ3 (secondary).** Do defect categories differ systematically in detectability across the four LLMs evaluated, and is at least one LLM strictly Pareto-dominant across the cost-accuracy frontier?
- **RQ4 (methodological).** Does inter-LLM Cohen's κ on the same image pairs correlate with LLM-vs-human Cohen's κ measured against author-coded ground truth, controlling for image-level difficulty?

- **H1.** Mean per-application κ across the 8-app corpus will be ≤ 0.55 (a non-trivial drop from the 0.667 TodoMVC baseline), reflecting external-validity attrition.
- **H2.** Per-application κ variance will be larger than per-defect-category κ variance, indicating that application-level UI characteristics dominate over defect-category effects.
- **H3.** Vision-LLM oracles will collectively achieve recall ≥ 0.55 on functional defects against the pixel-comparison baseline of ~0.50 reported in the antecedent TodoMVC study.
- **H4.** Inter-LLM κ on the same image pairs will be ≥ 0.40 lower than LLM-vs-human κ — replicating and generalizing the negative observation reported in the antecedent TodoMVC study (LLM-vs-LLM κ = −0.059).

RQ1–RQ4 are answered by Phase 2 (live-Docker, deferred). Phase 1 reports infrastructure-validation evidence only: end-to-end harness operability, per-judge accuracy against by-construction ground truth on the synthetic-HTML pilot, pairwise and three-way inter-judge agreement, and the catalogue of failure modes encountered during dispatch. No primary inference about RQ1–RQ4 is drawn from Phase 1 numbers.

## 3.2 Application corpus

### Phase 2 corpus (pre-registered)

The Phase 2 sample is eight open-source web applications, selected for diversity along three orthogonal dimensions: application class (chat, productivity, code-host, design-canvas, scheduling, low-code), front-end framework (React, Vue, Svelte, native canvas/SVG), and rendering paradigm (server-rendered, single-page, canvas-dominated, hybrid). The eight applications are RealWorld Conduit, Mattermost, Excalidraw, GitLab CE, Rocket.Chat, Penpot, Cal.com, and NocoDB. Each is distributed under an OSS license permitting research use and is containerizable via an official Docker image at a pinned content-addressable digest (Malhotra 2026, Pre-Registration §4.1).

The pre-registered substitution rule drops applications in priority order if onboarding fails: NocoDB first, then Penpot. If both drops occur and the sample falls below six applications, Vue Storefront is added as backup #3 to maintain a six-application minimum; if Vue Storefront also fails, the study proceeds with the reduced sample and discloses the attrition in the threats-to-validity section. All substitutions are documented in the manuscript with reasoned justification.

The Phase 2 Docker setup follows a uniform convention: a per-application `RUNBOOK.md` documenting the upstream image, the pinned digest, environment variables, seed scripts, and the network-idle wait policy. The capture orchestrator reads only the pinned digests; runtime image rotation is suppressed by the digest pin. Seed scripts populate each application with a deterministic fixture (e.g., a fixed set of channels for Mattermost, a fixed scratchpad for Excalidraw) so that the visual baseline is reproducible across runs.

### Phase 1 corpus (synthetic-HTML pilot)

Phase 1 substitutes a deterministic synthetic-HTML fixture for live Docker capture. The synthetic renderer is parameterized by application name and produces 50 baseline–defect pairs per nominal application across the same six defect categories used in Phase 2, yielding 400 image pairs in total. Per-application labels in Phase 1 are *nominal*: they are carried through the manifest contract (`data/images/_pairs_manifest.json`) for orchestrator-contract reasons — so that the dispatcher, the analysis pipeline, and the parquet schema operate identically across the two phases — but they do not reflect live-application screenshots and therefore do not carry the application-level diversity that the Phase 2 sample is designed to test. Reviewers should treat Phase 1 results as a pilot of the harness, not as evidence about real-application visual regression detection. The defect-injection primitives applied to the synthetic fixture are the same primitives that will be applied to live Docker captures in Phase 2.

## 3.3 Defect taxonomy and injection

Six defect categories, locked in the pre-registration (§4.2), operationalize the seeded-defect space. Each category corresponds to one injection primitive in `injection/primitives.ts`, with the operational definition specifying the mutation, the diff signature an inspector should look for, and a target inter-coder κ for the Phase 2 human-rater protocol (Table 1).

**Table 1.** Defect categories, injection primitives, and operational definitions.

| Category | Primitive | Operational definition | Diff signature | κ target |
|---|---|---|---|---:|
| `layout` | `shift_element` | Translate element via CSS `transform: translate(dx, dy)`; default `(12, 0)` px. | SSIM drop > 0.05 in shifted region. | ≥ 0.80 |
| `color` | `mutate_color` | Rotate computed foreground (or background) hue by ≥ 15° in HSL space; written back via inline style. | ΔE2000 > 5 in affected pixels. | ≥ 0.75 |
| `missing` | `remove_element` | Remove visible interactive element via `Element.remove()`. | > 2 % pixel delta in the prior bounding region. | ≥ 0.90 |
| `truncation` | `shrink_container` | Force `max-width` to 60 % of original, `overflow: hidden`, `text-overflow: clip`, `white-space: nowrap` — raw clip, no ellipsis. | Edge-density spike at right boundary; `scrollWidth > clientWidth`. | ≥ 0.75 |
| `zorder` | `swap_zindex` | Swap computed `z-index` of two positioned elements (substituting 0 for `auto`); promote `position: static` to `relative` so the swap takes effect. | Overlap-region SSIM < 0.70 versus baseline. | ≥ 0.70 |
| `contrast` | `reduce_contrast` | Lighten text colour along the linear RGB walk toward effective background until WCAG ratio falls to ≤ 3.0 (below the AA threshold of 4.5:1 for normal text). | Computed contrast ratio < 4.5; target ratio 3.0. | ≥ 0.75 |

The Phase 2 target is 50 image pairs per application × 8 applications × 1 viewport sampled per pair, distributed across the six categories as 8/8/8/8/9/9 — yielding 400 defect images, 400 paired baselines, and 800 evaluation pairs (1,600 image files when both viewports are captured; one viewport reserved for the held-out-viewport sensitivity analysis per pre-reg §5.2). Phase 1 produced 400 image pairs from the synthetic fixture, distributed across the same six categories with the same per-application target of 50 pairs.

Capture protocol (both phases). All screenshots are rendered through Playwright (version pinned in `package.json`) at two viewports — 1440 × 900 (desktop) and 375 × 667 (mobile, iPhone SE class). The orchestrator waits for the `networkidle` Playwright state before each capture to suppress in-flight resource jitter; pairs whose rendering script reports any non-deterministic warning (font fallback, network-resource timeout) are excluded from the analysis sample and re-rendered up to five times, after which they are recorded as non-renderable and excluded with reasoned documentation (pre-reg §6).

## 3.4 Oracles

Three oracle classes are exercised against every image pair. Oracle results are pooled per pair into a single record schema (`results/judgments_<timestamp>.parquet`) that captures the verdict, the rationale, the raw model response, the latency, the cost, and the `malformed` flag for each (pair, oracle) tuple.

**O1 — Pixel SSIM.** Deterministic structural-similarity comparison (Wang et al. 2004) implemented in `oracles/pixel_diff.ts` using `scikit-image` for the underlying SSIM kernel. The verdict threshold is pre-specified as the value that maximizes F1 on a held-out 80-pair calibration sample stratified by application (10 pairs per application), drawn with `numpy.random.seed(20260619)` per pre-reg §11. The calibration procedure is locked; the threshold value itself is not pre-stated and is reported in the manuscript.

**O2 — Perceptual hash.** Deterministic dHash (Krawetz 2013) with a Hamming-distance threshold derived by the same F1-maximization procedure on the same 80-pair calibration sample. Implemented in `oracles/phash.ts`.

**O3 — LLM-as-Judge.** Three vision LLM judges are dispatched against every pair in Phase 1 (Phase 2 adds Gemini back for the four-judge pre-registered design). The prompt is ported verbatim from the antecedent agent-harness work and is committed at `oracles/llm_judge/prompt.txt`; the prompt provenance and full text are documented in `oracles/llm_judge/PROMPT_SOURCE.md`. Each judge is instructed to emit a single-line JSON verdict of `fail` (regression detected) or `pass` (no regression), with a free-text rationale. The dispatcher (`oracles/llm_judge/dispatcher.ts`) enforces bounded per-judge concurrency (default 3), retries exactly once on malformed responses per pre-reg §6, and writes parquet output with a sha256 prompt-identifier per row.

The three Phase 1 judges, each pinned per OSF §4.4 with the exact identifier captured to `results/judgments_metadata.json` at first-judgment run (Decision A):

- **Claude Sonnet 4.5** via `claude -p` OAuth subprocess (the user's Claude Code subscription; subscription path, $0 marginal cost per call). Resolved identifier `claude-sonnet-4-5-20250929` at the W7 first-judgment run.
- **OpenAI gpt-5-codex** via `codex exec` ChatGPT-session subprocess (the user's OpenAI Codex subscription; subscription path, $0 marginal cost per call). Resolved identifier `gpt-5-codex`.
- **Llama 3.2 Vision 11B** via local Ollama (no per-token pricing). Pinned by the Ollama tag `llama3.2-vision:11b`, which is not subject to subscription rotation.

**Llama integration finding (Phase 1).** During the 2026-06-06 W7 dispatch, the Llama judge returned malformed verdicts for all 400 pairs with the provider-side error string `"this model only supports one image while more than one image requested"`. The model refuses requests carrying more than one image, which the visual-assertion prompt structurally requires (baseline + defect). The documented workaround composites the baseline and defect images into a single PNG side-by-side using `sharp`, separated by a 4-pixel vertical divider, with a 28-pixel label band reading `"BASELINE LEFT"` and `"DEFECT-CANDIDATE RIGHT"` placed above each panel. The workaround is implemented in `oracles/llm_judge/llama_ollama.ts::compositeBaselineAndDefect` and unit-tested at `tests/test_llama_composite_unit.ts`; a one-pair manual smoke is available via `scripts/smoke_llama_fix.ts`. With the composite applied, the 2026-06-09 re-run produced 0/400 malformed responses. This finding is re-surfaced in §6 (Threats to Validity) because the composite confounds a model-capability question with an input-format question for the Llama 0 % accuracy result.

## 3.5 Ground truth and inter-rater reliability

### Phase 2 ground truth (pre-registered)

The Phase 2 primary ground truth is sole-author coding of all 800 image pairs as `{defect_present: yes|no, defect_category: layout|color|missing|truncation|zorder|contrast, confidence: high|medium|low}`. Coding is conducted in 90-minute blocks to mitigate fatigue drift, with image presentation order randomized via a Fisher-Yates shuffle (`seed=20260622`) independently per coder to break any defect-injection-order regularity that could leak ground truth. A stratified random subsample of 80 image pairs (10 %) is double-coded by two volunteer raters who are not co-authors and who hold no prior collaboration with the author on this manuscript. Raters receive the codebook and a 10-image calibration set before coding the 80-pair subsample. Inter-rater Fleiss' κ across the three coders is reported on the subsample; pairwise Cohen's κ is reported for each coder pair. The disagreement-resolution protocol is pre-specified: any pair where ≥ 1 rater disagrees with the author triggers a three-way discussion, and pairs without consensus are reported as `unresolved` and excluded from the primary analysis with a sensitivity check.

A Fleiss' κ failure floor of 0.60 (Landis & Koch substantial-agreement threshold; Landis & Koch 1977) is pre-registered. If the observed Fleiss' κ falls below this floor, one re-calibration cycle is executed: the calibration set is expanded to 20 images incorporating exemplars from the disagreement region, the codebook is revised, all 80 pairs are re-coded, and Fleiss' κ is recomputed. If κ remains below 0.60 after re-calibration, the manuscript reports the failure transparently and the inter-rater analysis is moved from primary to exploratory (pre-reg §12 Decision B).

### Phase 1 ground truth (by construction)

Phase 1 ground truth requires no human coding. Every pair in `data/images/_pairs_manifest.json` is by construction a baseline-versus-defect pair in which exactly one defect from the six pre-registered categories has been programmatically injected by one of the primitives in `injection/primitives.ts`. The expected verdict for every pair is therefore `fail`, and accuracy and recall coincide; precision is undefined because the corpus contains no true-negative pairs. No inter-rater reliability is reported for Phase 1 because the construction is fully algorithmic and auditable from the per-application capture ledgers (`data/images/<app>/_capture_ledger.json`). The Phase 2 human-rater protocol described above is independent of Phase 1 and is the appropriate ground-truth instrument for the live-Docker corpus.

## 3.6 Analysis plan

### Phase 2 confirmatory analyses (pre-registered)

Four pre-registered primary analyses (Malhotra 2026, Pre-Registration §5.1):

1. **Per-LLM-judge per-application Cohen's κ** against author-coded ground truth, reported as a four-by-eight matrix with 95 % BCa bootstrap CIs (1,000 resamples, `seed=20260621`). Confirmatory of H1.
2. **Mixed-effects logistic regression** with binary outcome (LLM-judge agreement with ground truth), fixed effect on LLM identity (four levels), and random intercepts on application and defect category. Fitted in R with `lme4::glmer` (logit link; Bates et al. 2015). Singular-fit warnings are diagnosed via `optimx` re-fits or by simplifying the random-effect structure with explicit documentation. Confirmatory of H2.
3. **McNemar's pairwise tests** (McNemar 1947) between each oracle pair: LLM-as-judge versus pixel SSIM, LLM-as-judge versus pHash, and pairwise between LLMs. Confirmatory of H3.
4. **Inter-rater agreement (LLM–LLM)** as pairwise Cohen's κ across the four LLMs on all 800 pairs (six pairwise comparisons plus Fleiss' overall; Fleiss 1971), correlated with LLM-versus-human κ via Spearman ρ on the 80-pair subsample. Confirmatory of H4.

Three pre-registered sensitivity analyses run alongside the primary set (not exploratory): a re-run on the held-out viewport (375 × 667 mobile instead of 1440 × 900 desktop), a re-run with the alternative SSIM threshold derived by Youden's J on the calibration set, and a re-run on the rater-disagreement-excluded subset. Pre-specified subgroup analyses include defect-category and application-class (chat, productivity, code-host, design-canvas) strata.

### Phase 1 analyses

For the Phase 1 synthetic-HTML pilot, per-judge accuracy and recall are computed against the by-construction ground truth (`fail` for every pair); precision is reported as undefined for the reason given in §3.5. Pairwise Cohen's κ is computed over the binary `{fail, pass}` verdict space on the 400-pair intersection of valid verdicts for each judge pair, and Fleiss' κ is computed across all three judges. Per-application and per-defect-category breakdowns are reported for descriptive interpretation, with the explicit caveat that per-application labels in Phase 1 are nominal (§3.2). All confidence intervals are percentile bootstrap with 1,000 resamples and fixed seed 42 in `analysis/analyze_judgments.py`. The full Phase 1 analysis — accuracy, pairwise and three-way agreement, per-application and per-category breakdowns, latency, cost, and failure-mode counts — is reproducible from a fresh clone via `./scripts/reproduce_paper.sh` followed by the dispatcher invocation and `analysis/analyze_judgments.py`, with machine-readable and human-readable outputs emitted at `analysis/results/phase1_analysis_<timestamp>.{json,md}`.
