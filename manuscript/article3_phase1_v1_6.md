# Visual Oracle Bench (Phase 1): A Two-Judge Synthetic-HTML Pilot for LLM-as-Judge Visual Regression Detection with Specificity Reporting

**Author:** Suneet Malhotra
**ORCID:** [0009-0003-8707-9590](https://orcid.org/0009-0003-8707-9590)
**Affiliation:** Senior Manager, Test Engineering, Motorola Solutions, Los Angeles, CA, USA *(independent research; affiliation for identification only; the work uses only public infrastructure)*
**Corresponding email:** suneetmalhotra2002@gmail.com
**Website:** [suneetmalhotra.com](https://suneetmalhotra.com)
**GitHub:** [@SuneetMalhotra](https://github.com/SuneetMalhotra)
**LinkedIn:** [linkedin.com/in/suneet-m](https://www.linkedin.com/in/suneet-m)
**Pre-registration:** OSF DOI [10.17605/OSF.IO/NKD6J](https://osf.io/nkd6j/) (registered 2026-06-06, prior to any LLM judgment collection; Amendment 1, 2026-06-11, documents the Phase 1 correction protocol — see §3.5)
**Companion repository:** [github.com/SuneetMalhotra/visual-oracle-bench](https://github.com/SuneetMalhotra/visual-oracle-bench) — Zenodo concept DOI 10.5281/zenodo.20620870; version DOI for release tag `v1.6.0-emse-option-b`: 10.5281/zenodo.TBD-VERSION-DOI *(minted at submission; see Data Availability)* (MIT code, CC-BY 4.0 data)
**Target venue:** Empirical Software Engineering (EMSE) — Methodological Articles track
**Manuscript draft date:** 2026-06-11 (v1.6)

---

## Highlights

- A specificity-inclusive Phase 1 pilot corpus for LLM-as-judge visual regression oracles: 600 synthetic-HTML screenshot pairs (400 with one programmatically injected defect each, 200 identical-image controls), with by-construction ground truth for both classes.
- Two-judge comparative evidence on the integrity-audited subset: OpenAI gpt-5-codex 87.5% accuracy / 73.1% recall / 100.0% specificity (n=375); Claude Sonnet 4.5 78.4% accuracy / 45.8% recall / 100.0% specificity (n=208); pairwise Cohen's κ = 0.679 (95% CI [0.565, 0.788], substantial) on the n=208 both-clean intersection.
- Neither judge produced a single false positive on the 200 identical-image control pairs (Claude 0/125 clean controls, Codex 0/200) — the property that matters most for unattended-CI gating.
- A silent-fabrication detection mechanism and data-integrity correction protocol, contributed as a reusable methodology for any LLM-eval pipeline: the original judge wrappers silently defaulted to `verdict=fail` on rate-limit and auth-error responses; 617 affected rows were detected, re-flagged, and excluded, and the wrapper patch, detection signals, and audit trail are all released.
- One judge (Llama 3.2 Vision 11B) is excluded from comparative analysis owing to a documented multi-image input limitation; the integration failure is reported as a methodological finding in Appendix A.
- OSF pre-registration timestamp predates any LLM judgment collection. Phase 1 is a separately-framed methodological pilot; the registered Phase 2 live-capture experiment is deferred and unchanged.

---

## Abstract

**Context.** Vision-capable LLMs are a candidate third oracle class for visual-regression testing in web GUIs. Existing LLM-as-judge evidence is dominated by defect-only corpora, on which a judge that always answers "fail" scores perfectly — specificity is unmeasured.

**Objective.** This paper reports Phase 1 of Visual Oracle Bench: a pre-registered, specificity-inclusive synthetic-HTML pilot evaluating two vision-LLM judges as visual regression oracles, and a data-integrity correction protocol for LLM-eval pipelines.

**Method.** A 600-pair corpus (400 defect pairs across six pre-registered categories; 200 identical-image control pairs) was judged by Claude Sonnet 4.5 (OAuth subprocess) and OpenAI gpt-5-codex (subscription subprocess), with a Llama 3.2 Vision 11B run isolated in an appendix owing to an input-modality confound. During analysis we discovered that the original judge wrappers had silently fallen through to a default `fail` verdict on rate-limit and auth-error responses; we patched the wrappers, re-flagged 617 affected rows as malformed, and report metrics on the clean subset.

**Results.** On integrity-audited rows: gpt-5-codex 87.5% accuracy, 73.1% recall, 100.0% specificity (n=375); Claude Sonnet 4.5 78.4% accuracy, 45.8% recall, 100.0% specificity (n=208). Codex's recall advantage is significant under an exact paired McNemar test on the both-clean defect intersection (25/0 discordant pairs, p < 10⁻⁷). Neither judge produced a false positive on any control pair. Pairwise Cohen's κ = 0.679 (95% CI [0.565, 0.788], substantial). Both judges missed every z-order defect in the clean subset.

**Conclusions.** Specificity-inclusive corpora and fail-fast wrapper guards are both necessary for trustworthy LLM-as-judge evaluation; defect-only corpora and silent fallback verdicts each inflate apparent accuracy. Phase 2 (live capture of eight applications) remains pre-registered and deferred.

# 1. Introduction

## 1.1 The visual-assertion problem in modern web GUI testing

Automated GUI testing for modern web applications has long relied on assertions over the document object model: presence, text equality, attribute equality, and structural locators against an expected reference state. This style of assertion is brittle against semantic-preserving refactoring and silent against visual defects that do not alter the DOM. The visible artifact is what the user perceives, but the DOM is what most test suites measure. The gap between the two — a button still present in the DOM but rendered behind a modal overlay, a label still in the markup but truncated by a CSS regression, a colour token still set but failing WCAG contrast — is the operational territory of *visual regression testing*.

Historical industry practice has answered the visual-assertion problem with pixel comparison or perceptual hashing of rendered screenshots [Wang et al. 2004]. Pixel-diff approaches are sensitive but not specific: they flag every antialiasing change and every legitimate redesign as a regression, producing a noise floor that erodes practitioner trust. Perceptual-hash and structural-similarity (SSIM) approaches reduce false positives at the cost of detection sensitivity, and both families struggle to distinguish *cosmetic* differences from *functional* defects in the user-perceived semantics of the page. The unresolved core problem is the oracle problem in its visual variant [Barr et al. 2015]: the test infrastructure can capture pixels but cannot, without expensive human review, decide whether a pixel-level difference matters.

A 2024–2026 line of work has proposed using vision-capable large language models as the oracle for visual assertions. The premise is that a multimodal LLM can compare a baseline screenshot to a candidate screenshot and produce a verdict — pass or fail — that approximates the judgement a human reviewer would make. This LLM-as-Judge framing has been catalogued at scale across software-engineering subtasks by recent surveys [He et al. 2025; Hou et al. 2024; Fan et al. 2023]. For a test-engineering lead deciding whether to put such an oracle in a CI gate, two numbers matter and the second is routinely missing from the literature: how many real regressions the oracle catches (recall), and how often it cries wolf on an unchanged page (specificity). An oracle with high recall and unmeasured specificity is undeployable, because false positives — not missed defects — are what cause teams to mark a visual gate advisory and stop reading it.

## 1.2 Why a pre-registered, specificity-inclusive benchmark matters

The empirical software-engineering literature documents a reproducibility deficit in LLM-evaluation work [Sjøberg et al. 2007; Wohlin et al. 2012]. Two patterns recur. First, evaluation corpora are routinely defect-only, so that precision, specificity, and chance-corrected agreement on a realistic verdict mix are undefined — and a degenerate judge that answers `fail` on every input scores at ceiling. Second, evaluation protocols are described after the data have been seen, so the reader cannot distinguish a confirmed prediction from a post-hoc rationalisation. Pre-registration addresses the second pattern by committing hypothesis, analysis plan, and sample-size budget to a timestamped record before the data are observed [Sjøberg et al. 2007]. A corpus with by-construction true negatives addresses the first.

This study adds a third pattern, discovered in our own pipeline: **silent fabrication**. LLM judges are reached through wrappers — CLI subprocesses, API clients, retry shims — and a wrapper that converts a provider error into a syntactically valid default verdict fabricates data without any malformed-response counter incrementing. On a defect-only corpus a fabricated `fail` is indistinguishable from a correct detection, so the two deficits compound: the corpus design hides the wrapper bug, and the wrapper bug inflates the corpus-level accuracy. Phase 1 of this benchmark hit exactly this failure mode, detected it, and corrected it; §3.5 specifies the detection protocol and §6.1 quantifies the damage.

For LLM-as-Judge visual oracles, the antecedent agent-harness work in this research programme reported κ = 0.667 on a 24-image TodoMVC corpus with a single LLM judge [Malhotra 2026a, JSSOFTWARE-D-26-01260]; the closest contemporaneous benchmark targeting Web E2E testing reports against a small fixture set [Olianas et al. 2026, BEWT]. Neither measures specificity against by-construction true negatives. This paper does.

## 1.3 Contributions

This paper makes four contributions, each scoped to what the Phase 1 pilot establishes.

**Contribution 1: a specificity-inclusive Phase 1 pilot corpus for LLM-as-judge visual regression oracles.** The corpus comprises 600 synthetic-HTML screenshot pairs: 400 baseline–defect pairs with exactly one programmatically injected defect drawn from six pre-registered categories (`layout`, `color`, `missing`, `truncation`, `zorder`, `contrast`), and 200 identical-image control pairs (baseline = candidate) constructed so that specificity, precision, F1, and MCC are defined. Ground truth for both classes is by construction. The corpus, manifest, injection primitives, and capture orchestrator ship under MIT (code) and CC-BY 4.0 (data).

**Contribution 2: a two-judge comparative analysis with bootstrap CIs and paired inferential tests.** Claude Sonnet 4.5 and OpenAI gpt-5-codex are compared on the integrity-audited subset with full confusion matrices, per-category recall, per-control specificity, percentile-bootstrap confidence intervals, exact paired McNemar tests on the both-clean intersection, and Holm correction across per-category comparisons.

**Contribution 3: an integration-failure-mode catalog, reported separately from the comparative analysis.** The Llama 3.2 Vision 11B judge required a side-by-side composite-image workaround for a single-image input limitation; because this changes the input modality relative to the other judges, Llama is excluded from all headline comparisons and reported in Appendix A as a documented integration failure with an explicit capability-versus-format confound.

**Contribution 4: a silent-fabrication detection mechanism and data-integrity correction protocol.** The original judge wrappers defaulted to `verdict=fail` with `malformed=false` when a provider returned a rate-limit message or empty output. We specify the four detection signals that identify such rows retroactively, the wrapper patch that prevents them prospectively, and the audit trail (original parquets retained; exclusions reproducible from the released analyzer). The protocol is applicable to any LLM-eval pipeline in which judges are reached through wrappers — which is all of them.

## 1.4 The silent-fabrication discovery

Phase 1 analysis surfaced a silent-fabrication artifact in the original judge wrappers: when a provider returned a rate-limit message (Claude OAuth at high call volume) or an empty stdout (Codex CLI with an expired refresh token), the wrapper defaulted to `verdict=fail` with `malformed=false` instead of triggering the prescribed retry path. Across the three pre-2026-06-10 dispatch runs this yielded 617 silently-fabricated rows whose verdict happened to coincide with the all-defect ground truth, inflating the reported accuracy. We patched the judge wrappers (commits `9352483`, `da1f70a`), added a dispatcher fail-fast gate (`da1f70a`), re-ran the affected portion via a Codex top-up on the control pairs (`0745d7b`), and report metrics here on the clean subset (n=375 Codex, n=208 Claude, n=208 both-clean intersection for paired statistics). The original wrapper code dates to commit `eaf1e4d` (2026-06-06); the original parquets are retained unmodified for auditability.

We disclose this prominently rather than re-running the entire corpus silently and reporting only the final numbers, for two reasons. First, the discovery is itself the strongest methodological finding of the pilot: a defect-only corpus design and a fallback-to-`fail` wrapper bug are individually survivable, but jointly they produced headline accuracies of 88.8% and 88.2% in our own v1 draft — numbers that were wrong, in the flattering direction, and undetectable from the analysis outputs alone. Second, the correction protocol — detection signals, retroactive re-flagging, audited exclusion, prospective fail-fast — is reusable, and its credibility depends on showing it applied to our own data, not a hypothetical.

## 1.5 What this paper explicitly does not do

This paper does not answer the pre-registered RQ1–RQ4 from the OSF registration. It does not measure cross-application generalisation: the Phase 1 corpus is synthetic-HTML rendered by a deterministic fixture, and the profile labels in the Phase 1 manifest are nominal parameter sets (reported as `synthetic_profile_1..8` in §4), not screenshots of the eight open-source applications named in the Phase 2 registration. It does not fit the registered mixed-effects logistic regression, which requires the live-application corpus. It does not report human inter-rater reliability, because Phase 1 ground truth is by construction. These omissions are the boundary of the pilot framing: Phase 2 — the registered live-capture experiment over eight applications — is deferred, and the registration is unchanged (Amendment 1 documents the Phase 1 correction protocol only; see §3.5).

## 1.6 Paper roadmap

Section 2 surveys the adjacent literatures. Section 3 specifies the methodology, including the control-pair construction (§3.4) and the silent-fabrication detection protocol (§3.5). Section 4 reports results on the integrity-audited subset. Section 5 discusses the recall gap between the two judges, the specificity finding, and the agreement shift after correction. Section 6 enumerates threats to validity, leading with the silent-fabrication contamination. Section 7 concludes with practitioner lessons. Appendix A reports the Llama 3.2 Vision integration failure.

---

# 2. Related Work

## 2.1 LLM-as-Judge for software engineering evaluation

The use of large language models as automated evaluators of software-engineering artefacts is the subject of a 2025 systematic literature review by He and colleagues [He et al. 2025], which catalogues several hundred studies across code generation, bug detection, test generation, requirements analysis, and program repair. The review documents both the rapid growth of the LLM-as-Judge framing in SE and a set of recurring methodological deficits: single-system evaluation, opaque prompts, absent reproducibility artefacts, and a near-universal absence of pre-registration. Two broader SE surveys — the ACM TOSEM mapping by Hou and colleagues [Hou et al. 2024] and the ICSE Future of Software Engineering survey by Fan and colleagues [Fan et al. 2023] — corroborate the same pattern at wider scope: LLMs are being adopted as evaluators across the SE lifecycle faster than the corresponding evaluation methodology is being formalised.

Within this literature, the antecedent agent-harness study from the present research programme [Malhotra 2026a, JSSOFTWARE-D-26-01260, under submission] reported Cohen's κ = 0.667 for a vision-LLM visual-assertion oracle against a 24-image seeded ground truth on the TodoMVC reference application. The companion Specification Enrichment manuscript [Malhotra 2026b] reports a different axis of the same harness. Independently, the BEWT benchmark for Web E2E testing oracles [Olianas et al. 2026, JSS] reports against a related but distinct fixture set. Two gaps are common to all three points of comparison and to the wider LLM-as-judge visual-oracle literature: evaluation corpora contain no by-construction true negatives, so the false-positive behaviour of the judge is unmeasured; and judge wrappers are treated as transparent, so wrapper-induced data corruption is undetectable from reported metrics. This paper addresses both.

## 2.2 Visual regression testing oracles

The history of visual-regression-testing oracles traces back to pixel-by-pixel image differencing, which is sensitive but produces a noise floor dominated by antialiasing variation, sub-pixel rendering differences across operating-system text engines, and cosmetic changes that are not regressions. Structural similarity [Wang et al. 2004] introduced a perceptual quality metric aggregating luminance, contrast, and structure terms and remains the most widely cited alternative to per-pixel difference. Practitioner tooling has largely converged on perceptual-hash variants (dHash, pHash) that compress an image to a short bit string and threshold the Hamming distance between baselines. The tradeoff is the same across all of these metric families: lowering the detection threshold reduces false negatives at the cost of false positives, and the calibrated threshold that maximises F1 on a held-out set is corpus-specific. None of these metrics can distinguish a *cosmetic* difference from a *functional* defect without external semantic context.

Snapshot-testing tools in the JavaScript ecosystem — Jest snapshot, Storybook visual regression, and commercial services such as Percy — operationalise the same family: committed baseline screenshots are stored and the build fails on any diff above a calibrated threshold. The inherited tradeoff is well documented in practitioner accounts: maintenance overhead grows with codebase size, baseline churn correlates with redesign frequency, and the noise floor drives teams either to mark snapshots advisory (eroding their oracle status) or to widen thresholds (eroding their detection sensitivity). The general framing of these limits as instances of the *oracle problem* dates to Barr and colleagues [Barr et al. 2015], who identify the visual variant as a case where the test infrastructure can observe but cannot judge.

LLM-as-Judge oracles entered this space in 2024–2026 as a candidate third class. The early empirical evidence — including the κ = 0.667 antecedent figure on TodoMVC [Malhotra 2026a] — suggests the framing is at least viable. What that evidence does not establish is the false-positive rate on unchanged pages, which for a CI-gate deployment is the governing property. The control-pair corpus introduced here measures it directly.

## 2.3 External validity in empirical SE

The empirical-SE methodological literature converges on the position that single-system studies are essential for hypothesis generation and insufficient for hypothesis confirmation. Wohlin and colleagues [Wohlin et al. 2012] formalise the distinction in terms of internal versus external validity and prescribe multi-system replication as the standard mechanism for closing the gap; Sjøberg and colleagues [Sjøberg et al. 2007] argue that the field's accumulated body of knowledge depends on whether claims established on one system are tested on others under disciplined protocols. The implication for LLM-as-Judge work is direct: a κ value reported against a single corpus is a starting point, not an answer. The Phase 2 design pre-registered at OSF [DOI 10.17605/OSF.IO/NKD6J] commits to a mixed-effects logistic regression with random intercepts for application and defect category [Bates et al. 2015; Gelman & Hill 2007] over live captures of eight open-source applications. Phase 1 does not fit this regression: the synthetic-HTML corpus does not provide the application-level variance the random-intercept parameter is designed to estimate, and presenting regression output against nominal profile labels would invite the precise confusion this paper is structured to avoid.

---

# 3. Methodology

This study follows a pre-registered, two-phase reporting structure. Phase 1 is a methodological pilot that exercises the benchmark harness end-to-end against a deterministic synthetic-HTML fixture and reports oracle metrics against by-construction ground truth. Phase 2 is the pre-registered experiment over a live capture of eight open-source web applications; it is deferred at submission time and answers the four pre-registered research questions. The full design was registered with the Open Science Framework on 2026-06-06, prior to the collection of any LLM judgment, at OSF DOI [10.17605/OSF.IO/NKD6J](https://osf.io/nkd6j/). Amendment 1 (2026-06-11) documents the Phase 1 data-integrity correction protocol and the control-pair extension; it does not alter the registered Phase 2 design. Methodology grounding follows Wohlin et al. (2012), with κ interpretation per Landis and Koch (1977).

## 3.1 Research questions and hypotheses

The four pre-registered research questions and four directional hypotheses are stated in the OSF pre-registration §2–§3 and concern the Phase 2 live-capture experiment: cross-application generalisation of the antecedent κ = 0.667 (RQ1), application characteristics predicting accuracy degradation (RQ2), defect-category detectability differences and Pareto dominance across judges (RQ3), and the correlation between inter-LLM and LLM-versus-human agreement (RQ4). RQ1–RQ4 are answered by Phase 2 and no primary inference about them is drawn from Phase 1 numbers. Phase 1 reports oracle metrics (sensitivity, specificity, precision, F1, MCC), inter-judge agreement, and the failure-mode catalog on the synthetic-HTML pilot corpus.

## 3.2 Corpus

### Phase 2 corpus (pre-registered, deferred)

The Phase 2 sample is eight open-source web applications selected for diversity along application class, front-end framework, and rendering paradigm, each containerised at a pinned digest, with a pre-registered substitution rule (OSF §4.1). The Phase 2 protocol is unchanged from the registration and is not consumed by Phase 1.

### Phase 1 corpus (synthetic-HTML pilot, 600 pairs)

Phase 1 substitutes a deterministic synthetic-HTML fixture for live capture. The fixture is parameterised by a profile label and produces baseline–defect pairs across the same six defect categories registered for Phase 2. The Phase 1 corpus (manifest v2, `data/images/_pairs_manifest_v2.json`) contains:

- **400 defect pairs** — 50 per profile across 8 profiles, each pair containing exactly one programmatically injected defect; expected verdict `fail`.
- **200 control pairs** — 25 per profile, in which the candidate image is identical to the baseline (baseline = candidate by construction); expected verdict `pass`.

The control pairs were added after the defect-pair dispatch, in response to adversarial review of the v1 draft which correctly observed that on a defect-only corpus precision, specificity, and MCC are undefined and a degenerate always-`fail` judge scores at ceiling. The control extension is documented in OSF Amendment 1; control-pair generation is implemented in `scripts/add_true_negatives.py`.

Profile labels are *nominal*: they identify the parameter set used to render each subset of the synthetic corpus, not any live application. To prevent over-reading, all per-profile tables in §4 use the labels `synthetic_profile_1..8`; the mapping from profile label to fixture parameter set is recorded in the manifest. Phase 1 results are evidence about the harness and about judge behaviour on this synthetic corpus; they are not cross-application evidence.

## 3.3 Defect taxonomy and injection

Six defect categories, locked in the pre-registration (§4.2), operationalise the seeded-defect space: `layout` (CSS translate, default 12 px), `color` (≥15° HSL hue rotation), `missing` (visible element removed), `truncation` (container shrunk to 60% max-width with raw clip), `zorder` (computed z-index swap of two positioned elements), and `contrast` (text colour lightened until WCAG ratio ≤ 3.0). Each category corresponds to one injection primitive in `injection/primitives.ts`, with operational definitions and diff signatures documented there and in the pre-registration. The per-primitive magnitude parameters were chosen by the author at implementation time and are an acknowledged degree of freedom (§6.4). All screenshots are rendered through Playwright (version pinned in `package.json`) at 1440 × 900, with `networkidle` waits to suppress in-flight resource jitter.

## 3.4 Judges

Two comparable judges are evaluated on every pair; both receive the baseline and candidate images as two separate image inputs:

- **Claude Sonnet 4.5** via `claude -p` OAuth subprocess (subscription path, $0 marginal cost per call). Resolved identifier `claude-sonnet-4-5-20250929`, captured to `results/judgments_metadata.json` at first-judgment run.
- **OpenAI gpt-5-codex** via `codex exec` ChatGPT-session subprocess (subscription path, $0 marginal cost per call). Resolved identifier `gpt-5-codex`.

The prompt is ported verbatim from the antecedent agent-harness work (`oracles/llm_judge/prompt.txt`; provenance in `PROMPT_SOURCE.md`). Each judge emits a single-line JSON verdict of `fail` (regression detected) or `pass` (no regression) with a free-text rationale. The dispatcher (`oracles/llm_judge/dispatcher.ts`) enforces bounded per-judge concurrency, retries exactly once on malformed responses per pre-registration §6, propagates the manifest's `expected_verdict` into the parquet schema, and — since commit `da1f70a` — aborts the run when consecutive malformed responses exceed a fail-fast threshold.

A third judge, **Llama 3.2 Vision 11B** (local Ollama, `llama3.2-vision:11b`), was dispatched on the 400 defect pairs but is excluded from all comparative analysis: the model rejects multi-image requests, and the documented workaround — compositing baseline and candidate side-by-side into a single PNG — changes the input modality relative to the other judges, so capability and format cannot be disentangled within the Phase 1 corpus. The integration failure, the workaround, and the resulting invariant-verdict behaviour are reported in Appendix A.

## 3.5 Silent-fabrication detection and data integrity

The original judge wrappers (commit `eaf1e4d`, 2026-06-06) contained a defect with consequences for every metric in the v1 draft: `parseVerdictJson` returns a fallback object on unparseable provider output, and the wrappers' guard condition tested for a null that could never occur, so parse failures flowed through the success path as `verdict=fail` with `malformed=false`. A rate-limited Claude OAuth response or an empty Codex CLI stdout therefore became a syntactically valid `fail` verdict that no malformed-response counter recorded. On the defect-only portion of the corpus, where ground truth is `fail` for every pair, each fabricated verdict scored as a correct detection.

The correction protocol has four parts:

1. **Retroactive detection.** Four signals identify affected rows in the historical parquets, any one being sufficient: the rationale begins with `MALFORMED` (the parser's fallback marker); the raw response is empty after whitespace strip (dead CLI subprocess); the raw response contains the substring `session limit` (Claude OAuth rate limit); or it contains `refresh_token` (Codex CLI auth failure). The canonical implementation is `analysis/analyze_judgments.py::_flag_silent_fabrications()`.
2. **Audited exclusion.** Any matching row is re-flagged `malformed=True` and excluded from all primary metrics. Across the three pre-2026-06-10 dispatch runs, 617 rows were re-flagged (392 Claude, 225 Codex). The original parquets are retained unmodified in the released artifact; the exclusion is recomputed at every analyzer run, so the correction is fully reproducible and reversible by inspection.
3. **Prospective prevention.** The wrappers now propagate the parser's malformed flag (commits `9352483`, `da1f70a`), which re-arms the dispatcher's retry-once path, and a fail-fast gate aborts the dispatch on consecutive-malformed streaks instead of silently completing.
4. **Targeted re-collection.** A Codex top-up run on the 200 control pairs (manifest `data/images/_topup_codex_2026-06-11.json`, commit `0745d7b`) replaced the fully-fabricated Codex control judgments; it completed with 0/200 malformed rows.

## 3.6 Ground truth and statistical methods

Phase 1 ground truth requires no human coding. Every defect pair contains exactly one programmatically injected defect (expected verdict `fail`); every control pair is byte-identical baseline-and-candidate (expected verdict `pass`). The confusion matrix per judge counts TP = defect pair correctly flagged `fail`, FN = defect pair judged `pass`, TN = control pair correctly judged `pass`, FP = control pair judged `fail`.

- **Sensitivity (recall)** is computed only over the defect pairs in the judge's clean subset.
- **Specificity** is computed only over the control pairs in the judge's clean subset.
- **Pairwise Cohen's κ** is computed over the intersection of pairs where both judges have a clean verdict (n=208 for Claude × Codex: 83 defect + 125 control pairs). Fleiss' κ is undefined with two comparable raters and is not reported.
- **Confidence intervals** are percentile bootstrap, 1,000 resamples, fixed seed 42. Where a cell has fewer than 10 clean observations the bootstrap CI is reported as n/a rather than as an exact interval.
- **Paired comparisons** between the judges use exact McNemar tests (two-sided binomial on discordant pairs) on the both-clean intersection [McNemar 1947], with Holm correction across the per-category family [Holm 1979]. CI-overlap inspection is not used for cross-judge claims.

The full analysis is reproducible from a fresh clone: the released parquets plus `analysis/analyze_judgments.py` and `analysis/paired_tests.py` regenerate every number in §4 without any LLM call, with machine-readable output at `analysis/results/phase1_analysis_<timestamp>.{json,md}`.

---

# 4. Results (Phase 1 — integrity-audited subset)

All numbers in this section are taken verbatim from the analyzer output (`analysis/results/phase1_analysis_2026-06-11T04-39-28Z.{json,md}`) and the paired-test output (`analysis/results/paired_tests_latest.json`); both are regenerable from the released parquets without any LLM call. The clean subset per judge is what survived the silent-fabrication exclusion of §3.5: 208 of 600 dispatched judgments for Claude, 375 of 600 for Codex. The headline findings, stated up front including the unflattering ones: Codex reaches 87.5% accuracy with 100.0% specificity but misses 26.9% of defects; Claude's specificity is also 100.0% but its clean-subset recall is 45.8%; and **both judges missed every z-order defect in their clean subsets** (Claude 0/9, Codex 0/27).

## 4.1 Confusion matrices and oracle metrics

**Table 1.** Per-judge confusion matrix and oracle metrics on the integrity-audited subset, against by-construction ground truth (`fail` for 400 defect pairs, `pass` for 200 control pairs). TP = defect correctly flagged; FP = false alarm on a control; TN = control correctly cleared; FN = missed defect.

| Judge | n_valid | TP | FP | TN | FN | accuracy | recall | specificity | precision | F1 | MCC | bal. acc |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Claude Sonnet 4.5 | 208 | 38 | 0 | 125 | 45 | 78.4% | 45.8% | 100.0% | 100.0% | 0.628 | 0.580 | 72.9% |
| OpenAI gpt-5-codex | 375 | 128 | 0 | 200 | 47 | 87.5% | 73.1% | 100.0% | 100.0% | 0.845 | 0.770 | 86.6% |

Neither judge produced a single false positive: every verdict of `fail` issued on a clean row was issued on a genuine defect pair, which is why precision is 100.0% for both. The two judges differ almost entirely in recall.

## 4.2 Sensitivity by defect category

**Table 2.** Per-category recall on clean defect rows, with 95% percentile-bootstrap CIs (1,000 resamples, seed 42). Cells with n < 10 report the CI as n/a (boundary-collapsed bootstrap intervals at this n are not informative). The `control` row reports specificity.

| Category | Claude Sonnet 4.5 (n) recall [95% CI] | gpt-5-codex (n) recall [95% CI] |
|---|---:|---:|
| color | 56.2% (n=16) [31.2%, 81.2%] | 69.7% (n=33) [51.5%, 84.8%] |
| contrast | 22.2% (n=18) [5.6%, 44.4%] | 100.0% (n=36) [100.0%, 100.0%] |
| layout | 6.2% (n=16) [0.0%, 18.8%] | 66.7% (n=30) [50.0%, 83.3%] |
| missing | 100.0% (n=16) [100.0%, 100.0%] | 100.0% (n=24) [100.0%, 100.0%] |
| truncation | 100.0% (n=8) [n/a] | 100.0% (n=25) [100.0%, 100.0%] |
| zorder | 0.0% (n=9) [n/a] | 0.0% (n=27) [0.0%, 0.0%] |
| *control (specificity)* | 100.0% (n=125) [100.0%, 100.0%] | 100.0% (n=200) [100.0%, 100.0%] |

Category difficulty is strongly bimodal. Element removal (`missing`) and text truncation are detected perfectly by both judges. Z-order defects — an element rendered behind another after a z-index swap — are detected by neither, in any clean row. Claude also misses 15 of 16 clean `layout` pairs and 14 of 18 clean `contrast` pairs. The v1 draft reported near-ceiling per-category numbers for both judges in `zorder` (87.5% and 62.5%); those numbers were dominated by fabricated `fail` verdicts and are retracted by this version (§6.1).

## 4.3 Paired comparison: Codex vs Claude

Unpaired recall differs by 27.3 percentage points (73.1% vs 45.8%), but the two clean subsets differ, so the load-bearing comparison is paired. On the 83 defect pairs where **both** judges have a clean verdict, Codex was correct on 63 (75.9%) and Claude on 38 (45.8%); on all 25 discordant pairs it was Codex that was correct and Claude that was wrong, and there was no pair where Claude succeeded and Codex failed. The exact McNemar test rejects symmetry at p = 6.0 × 10⁻⁸. Per category, only two cells have discordant pairs at all: `contrast` (14/0 in Codex's favour, Holm-adjusted p = 0.00024) and `layout` (11/0, Holm-adjusted p = 0.00098); the remaining four categories have zero discordant pairs (both judges right on `missing`/`truncation`, both wrong on `zorder`, split-free on `color`) and no test is performed. On the 125 both-clean control pairs there are likewise zero discordant verdicts.

On this corpus, Claude's correct defect detections are a strict subset of Codex's (confidence on the dominance pattern within the clean intersection: high; on its persistence under full re-dispatch: moderate, given the selection caveat of §6.2).

## 4.4 Inter-judge agreement

**Table 3.** Pairwise Cohen's κ on the both-clean intersection (defect + control pairs), bootstrap CI as in §3.6.

| Judge A | Judge B | n_pairs | κ | 95% CI | Landis-Koch |
|---|---|---:|---:|---|---|
| Claude Sonnet 4.5 | gpt-5-codex | 208 | 0.679 | [0.565, 0.788] | substantial |

The v1 draft reported κ = 0.361 ("fair") on the contaminated defect-only corpus. The corrected figure is higher for two compounding reasons analysed in §5.3: removal of fabrication noise, and the prevalence shift from a fail-only corpus to a mixed corpus. Fleiss' κ is not reported: it is undefined for two raters, and the third judge is non-comparable (Appendix A).

## 4.5 Per-profile breakdown

Profile labels are nominal fixture parameter sets (§3.2), reported as `synthetic_profile_1..8`; the label-to-parameter mapping ships in the manifest. Cells report accuracy over each judge's clean rows (defect + control) within the profile.

**Table 4.** Per-profile accuracy (n clean rows). The Claude column documents the session-limit attrition pattern: dispatch processed profiles in manifest order, and Claude's OAuth session limit exhausted mid-run, so later profiles have few or no clean Claude rows.

| Profile | Claude Sonnet 4.5 (n) | gpt-5-codex (n) |
|---|---:|---:|
| synthetic_profile_1 | 64.0% (75) | 80.0% (75) |
| synthetic_profile_2 | 68.4% (57) | 81.3% (75) |
| synthetic_profile_3 | 100.0% (25) | 81.3% (75) |
| synthetic_profile_4 | 100.0% (25) | 91.5% (47) |
| synthetic_profile_5 | 100.0% (25) | 100.0% (26) |
| synthetic_profile_6 | 100.0% (1) | 100.0% (25) |
| synthetic_profile_7 | n/a (0) | 100.0% (26) |
| synthetic_profile_8 | n/a (0) | 100.0% (26) |

This table is reported for completeness and audit, not for cross-profile inference: the per-profile cells confound profile identity with category mix and with the attrition pattern, and the corpus is synthetic regardless. No cross-application claim follows from it.

## 4.6 Latency and cost

**Table 5.** Wall-clock latency per dispatched call (all 600 dispatched calls per comparable judge, including rows later excluded by the integrity audit; subprocess start to verdict receipt).

| Judge | n | mean (ms) | median (ms) | p95 (ms) |
|---|---:|---:|---:|---:|
| Claude Sonnet 4.5 | 600 | 5,370 | 1,745 | 13,931 |
| OpenAI gpt-5-codex | 600 | 10,086 | 9,855 | 27,413 |

All judgments were billed at $0 marginal per-call cost via subscription channels (Claude Max; ChatGPT Plus + Codex CLI). A replicator using metered API paths would incur approximately $3–7 USD per 1,200-judgment dispatch at 2026-06 pricing (`oracles/llm_judge/cost_constants.ts`).

## 4.7 Failure-mode accounting

Of 1,200 dispatched comparable-judge calls, 617 (51.4%) were silently fabricated by the wrapper bug of §3.5 — 392 of Claude's 600 (65.3%) and 225 of Codex's 600 (37.5%) — and are excluded from every metric above. The Codex control run of 2026-06-10 was 200/200 fabricated (expired refresh token; empty stdout on every call) and was re-collected cleanly on 2026-06-11. Zero malformed rows remain in the clean subset by construction. This accounting is the quantitative core of the integrity disclosure; §6.1 discusses its implications and §6.2 the selection effects it induces.

## 4.8 What Phase 1 establishes — and does not

Phase 1 establishes: (a) on this synthetic corpus, both frontier judges have perfect specificity on identical-image controls and perfect recall on element-removal and truncation defects; (b) gpt-5-codex dominates Claude Sonnet 4.5 on defect recall under a paired exact test; (c) both judges are blind to z-order defects in this protocol; (d) inter-judge agreement on the clean intersection is substantial (κ = 0.679); and (e) wrapper-level silent fabrication occurred at a 51.4% rate and was detectable and correctable retroactively from released artifacts.

Phase 1 does not establish: (a) cross-application generalisation (synthetic corpus, nominal profiles); (b) specificity under *benign change* — the controls are byte-identical images, so 100.0% specificity here is an upper bound that says the judges do not hallucinate differences, not that they tolerate legitimate redesign (§6.4); (c) anything about Llama 3.2 Vision capability (Appendix A); (d) the pre-registered RQ1–RQ4, which remain Phase 2 questions.

---

# 5. Discussion

## 5.1 The recall gap between the judges

The headline practitioner finding is the recall gap: 73.1% vs 45.8% unpaired, and a strict-dominance pattern on the paired intersection (25/0 discordant defect pairs, p = 6.0 × 10⁻⁸). The gap concentrates where defects are subtle at the pixel level but semantically visible — `contrast` (Codex 100.0%, Claude 22.2%) and `layout` (66.7% vs 6.2%) — while both judges saturate on categorically obvious defects (`missing`, `truncation`) and both fail completely on `zorder`.

One mechanical explanation is processing budget: Codex's median call latency is 9,855 ms against Claude's 1,745 ms, consistent with the Codex CLI performing longer reasoning before answering. Longer deliberation plausibly buys more careful region-by-region comparison on subtle defects (confidence: moderate — latency is a proxy, and prompt-pipeline differences between the two CLI paths could contribute). What the data rule out is a sensitivity/specificity trade: Codex's higher recall costs zero false positives on the control set, so the gap is not explained by a more trigger-happy decision threshold (confidence: high on this corpus).

The shared z-order blindness is a different kind of finding. A z-index swap leaves both elements present with unchanged colours and text; detecting it requires reasoning about occlusion order. Neither judge managed it once in 36 clean opportunities. For practitioners this is the clearest "do not rely on the oracle for this class" result in the study (confidence: high for this protocol and corpus; unknown for other prompts or live pages).

## 5.2 Perfect specificity is the deployable property

Both judges returned `pass` on every clean control row — Claude 125/125, Codex 200/200. For unattended-CI gating this is the property that matters most: false positives, not missed defects, are what cause teams to mute a visual gate. A judge that never alarms on an unchanged page can be deployed in blocking mode at known recall, whereas a judge with even a few-percent false-positive rate generates daily noise at production screenshot volumes.

Two qualifications keep this honest. First, identical-image pairs are the easiest possible negatives; production negatives include antialiasing drift, dynamic timestamps, and legitimate redesigns. The 100.0% figure is therefore an upper bound on deployed specificity, and the benign-change variant belongs to Phase 2 (confidence that the no-hallucination property itself is real: high — n=325 clean controls across two judges with zero exceptions). Second, the control verdicts were trivially separable for a judge that actually compares its inputs: the strong result is that both models *do* compare rather than pattern-match toward "regression found", which is the failure mode the always-`fail` degenerate strawman represents — and which our own fabricated rows accidentally simulated at scale (§6.1).

## 5.3 Why κ moved from 0.361 to 0.679

The v1 draft reported fair agreement; the corrected analysis reports substantial agreement on the clean intersection. Two effects compound, and we cannot fully separate their contributions within this dataset (confidence: moderate).

First, fabrication noise. 392 Claude rows and 225 Codex rows carried wrapper-fabricated `fail` verdicts uncorrelated with image content. Fabricated verdicts inflated both judges' `fail` marginals on an already fail-only corpus, driving the expected-agreement term of κ upward and the chance-corrected statistic downward, while also injecting verdict pairs whose agreement or disagreement was accidental. Removing them removes both distortions.

Second, prevalence. The v1 κ was computed on defect-only pairs, where both judges' verdict distributions are extremely skewed and κ is known to behave pathologically [Cicchetti & Feinstein 1990; Feinstein & Cicchetti 1990]; the corrected κ is computed on a mixed corpus (125 control + 83 defect pairs in the intersection), where the marginals are closer to balanced and the same per-class agreement yields a higher κ. Both the n=208 figure and the prevalence caveat should travel together when this number is cited.

The antecedent agent-harness study reported κ = 0.667 on TodoMVC [Malhotra 2026a]. The numerical proximity to 0.679 is noted but not claimed as replication: the antecedent figure is an intra-judge consistency measurement (one model, repeated runs), while the present figure is inter-judge agreement between two different models on a different corpus. The constructs differ; the consistency is encouraging, nothing more (confidence: low on any stronger reading).

## 5.4 Implications for LLM-eval pipeline design

The silent-fabrication episode generalises beyond this benchmark. Every LLM-eval pipeline reaches its models through wrappers, and most corpora in the LLM-as-judge SE literature are positive-only, which makes default-verdict bugs invisible exactly when they inflate results. Three design rules follow directly from the Phase 1 experience: wrappers must treat "the provider said something unparseable" as malformed data, never as a verdict; corpora must contain cases where the lazy default answer is wrong (our control pairs served this function — the bug was caught because 200/200 Codex `fail` verdicts on identical images is impossible, whereas 88.8% accuracy on defects looked publishable); and dispatch must fail fast on malformed streaks rather than completing a multi-hour run of garbage. None of these is novel engineering; what Phase 1 contributes is a measured demonstration of how much damage their absence causes (51.4% of comparable-judge rows, and a headline accuracy inflated by 10.4 points for Claude) and a tested retroactive detection protocol for pipelines that already have contaminated archives.

---

# 6. Threats to Validity

We organise threats along the four conventional axes [Wohlin et al. 2012], leading with the one we created ourselves.

## 6.1 Silent-fabrication contamination (internal validity)

An audit of the original judge wrappers revealed a silent-fabrication artifact: provider rate-limit and auth-error responses were converted into syntactically valid `fail` verdicts with `malformed=false` (mechanism in §3.5). 617 rows across the three pre-2026-06-10 parquets were affected — 392 of Claude's 600 dispatched judgments and 225 of Codex's. Because the contaminated portion of the corpus was defect-only, every fabricated verdict scored as a correct detection, inflating v1's reported Claude accuracy from a true 78.4% to 88.8% and depressing reported inter-judge agreement from 0.679 to 0.361. All v1 headline numbers are superseded by this version.

The threat that remains after correction is detection completeness: the four signals of §3.5 identify the failure shapes we observed (parser fallback marker, empty stdout, session-limit and refresh-token substrings), and we cannot prove no fifth shape exists (confidence that the enumerated signals are exhaustive for these two CLI paths: moderate — the signals were derived by reading every distinct rationale and raw-response pattern in the 1,200 comparable-judge rows, not by sampling). The correction is fully reproducible: the original parquets are retained unmodified in the released artifact, the exclusion is recomputed at every analyzer run from `_flag_silent_fabrications()`, and a reviewer can delete the filter and watch the v1 numbers reappear.

## 6.2 Sample size and selection (internal / conclusion validity)

The clean subsets are not random samples of the corpus. Wrapper failures were caused by session exhaustion and token expiry, which correlate with dispatch *order*, not with image content — Claude's clean defect rows concentrate in early-manifest profiles (Table 4), and its per-category clean ns range from 8 to 18. We therefore treat category-conditional recall as approximately unbiased (failure cause is plausibly ignorable given category; confidence: moderate) but treat the small ns as the dominant uncertainty: bootstrap CIs at n=16–18 span 25–40 points, and cells at n<10 carry no interval at all. The pairwise κ is on n=208, smaller than v1's nominal n=400 — but v1's n included fabricated rows, so the honest comparison is "208 real pairs versus 400 partly-fabricated ones." The v1 CI [0.219, 0.499] and the corrected CI [0.565, 0.788] do not overlap; the change is driven by the correction, not by re-rolling sampling noise. A full clean re-dispatch of both judges on all 600 pairs (now feasible under the patched wrappers and fail-fast gate) is the obvious next check and is queued ahead of Phase 2.

## 6.3 Differential input-format confounding (construct validity)

The two comparable judges received identical paired-image inputs, so the headline comparison is format-matched. The third judge did not: Llama 3.2 Vision 11B rejects multi-image requests, and the side-by-side composite workaround changes both the input modality and the effective per-panel resolution. Any comparison between Llama's verdicts and the other judges' would confound model capability with input format, which is why Llama appears only in Appendix A and in no comparative table. The general lesson — judges must be format-matched or excluded from comparison — is stated as part of the integration-failure catalog (Appendix A).

## 6.4 Construct validity

*Binary verdict underrepresentation.* "Regression detection" is operationalised as a binary `{fail, pass}` verdict. Real visual-regression review involves severity gradations, localisation, and benign-change adjudication; a binary construct cannot express "changed but acceptably." The control pairs sharpen this limit: they are byte-identical images, so the measured 100.0% specificity bounds hallucination, not benign-change tolerance (§5.2). Severity-graded verdicts and benign-change controls are Phase 2 design items.

*Author degrees of freedom.* The six defect categories are pre-registered, but the per-primitive injection magnitudes (12 px translation, ≥15° hue rotation, 60% truncation width, WCAG ≤3.0 contrast target) were fixed by the author at implementation time and sit below the registration's resolution. These magnitudes determine task difficulty directly. Mitigations: the magnitudes are committed in `injection/primitives.ts` and quoted in §3.3 so reviewers can judge their realism; they were fixed before any judgment was collected (repository history verifies the ordering); and because Phase 1 findings could inform Phase 2 prompt or judge selection, we commit to carrying the registered Phase 2 protocol unchanged and reporting any deviation as an amendment, as done for the present correction.

*Synthetic-to-real gap.* The corpus is synthetic HTML rendered by a deterministic fixture. Profile labels are nominal parameter sets, reported as `synthetic_profile_1..8` precisely so no reader mistakes Table 4 for cross-application evidence. Synthetic fixtures lack the visual density, dynamic content, and rendering variance of live applications; recall measured here does not transfer to production screenshots without Phase 2 evidence (confidence that the synthetic numbers overestimate live recall: unknown — the direction of the gap is itself an open Phase 2 question).

## 6.5 Conclusion validity

*Prevalence-adjusted versus raw κ.* κ is prevalence-sensitive [Cicchetti & Feinstein 1990; Feinstein & Cicchetti 1990]. The corrected κ = 0.679 is computed on a 60/40 control/defect intersection; the contaminated v1 figure was computed on a 100% defect corpus. Readers comparing the two numbers are comparing different prevalence regimes as well as different data quality (§5.3); we report both regimes' caveats rather than a single "the κ improved" claim.

*Paired tests and multiplicity.* Cross-judge claims use exact McNemar tests on the both-clean intersection with Holm correction across the per-category family [Holm 1979]; CI-overlap inspection is not used. Only two per-category tests were performable (the other four categories had zero discordant pairs); both survive correction at p < 0.001. The overall paired test (p = 6.0 × 10⁻⁸) is a single pre-specified comparison and is not part of the corrected family.

*Small-cell intervals.* Cells with fewer than 10 clean observations (Claude `truncation` n=8, `zorder` n=9) report point estimates without intervals; we make no inferential claim from them beyond their contribution to the aggregate confusion matrix.

---

# 7. Conclusion

Phase 1 of Visual Oracle Bench set out to validate a benchmark harness and returned something more useful: a measured demonstration of how an LLM-as-judge evaluation can silently inflate itself, and the corrected evidence after the inflation was removed. On the integrity-audited subset of a 600-pair specificity-inclusive synthetic-HTML corpus, OpenAI gpt-5-codex detects 73.1% of injected defects and Claude Sonnet 4.5 45.8%, with the gap significant under an exact paired test; both judges achieve 100.0% specificity on identical-image controls; both are blind to z-order defects; and the two agree at κ = 0.679 (95% CI [0.565, 0.788]) on the clean intersection. The pre-registered Phase 2 live-capture experiment is deferred and its registration unchanged.

Six lessons for test-engineering leaders, each grounded in a specific Phase 1 observation:

1. **Even subscription-path LLM judges need fail-fast guards.** 51.4% of our comparable-judge calls were silently fabricated by a wrapper fallback before any guard existed. Silent fabrication is the failure mode you don't see coming, because it produces well-formed records.
2. **Verify the pipeline retroactively; don't trust wrapper code blind.** The bug was found by auditing raw responses against recorded verdicts after an implausible aggregate (200/200 `fail` on identical images) appeared — and the audit protocol, not the original code review, is what caught it.
3. **For unattended-CI gating, specificity outranks recall.** A judge that never false-alarms (both judges, 0/325 clean controls) can run in blocking mode at a known miss rate; a judge that cries wolf gets muted and protects nothing.
4. **Two judges agreeing is more defensible than one judge scoring well.** κ = 0.679 between independent models is harder to fake — by prompt overfitting or by pipeline bugs — than any single-judge accuracy; our own fabricated rows depressed agreement even while inflating accuracy.
5. **Defect-only corpora inflate apparent accuracy through fallback coincidence.** Every fabricated `fail` looked like a correct detection until control pairs existed for it to be wrong on. Always include cases where the lazy answer is wrong.
6. **Integration failures are findings — publish them.** The Llama multi-image limitation, the composite workaround, and the resulting unjudgeable confound (Appendix A) will save other teams the same week, but only if reported as openly as the headline numbers.

## Data availability

All artifacts ship at the companion repository under MIT (code) and CC-BY 4.0 (data): the 600-pair corpus and manifest v2, all four judgment parquets including the contaminated originals, the patched wrappers and dispatcher, the analyzer with the silent-fabrication filter, the paired-test script, and this manuscript. Zenodo concept DOI 10.5281/zenodo.20620870; version DOI for tag `v1.6.0-emse-option-b`: 10.5281/zenodo.TBD-VERSION-DOI *(minted at submission)*. Every number in §4 regenerates from the released parquets via `analysis/analyze_judgments.py` and `analysis/paired_tests.py` with no LLM access required.

---

# Appendix A. Llama 3.2 Vision: a multi-image integration failure

This appendix reports the third dispatched judge, excluded from all comparative analysis for the input-modality confound stated in §6.3. It is a catalog entry, not a capability assessment.

**The failure.** The initial 2026-06-06 dispatch returned malformed verdicts for 400/400 Llama judgments with the provider error `"this model only supports one image while more than one image requested"`: Llama 3.2 Vision 11B (via local Ollama, `llama3.2-vision:11b`) rejects requests carrying more than one image, which the paired-image visual-assertion prompt structurally requires.

**The workaround.** The baseline and candidate images are composited side-by-side into a single PNG — 4-pixel vertical divider, 28-pixel label band ("BASELINE LEFT", "DEFECT-CANDIDATE RIGHT") — implemented in `oracles/llm_judge/llama_ollama.ts::compositeBaselineAndDefect` and unit-tested in `tests/test_llama_composite_unit.ts`. The 2026-06-09 re-run completed with 0/400 malformed responses. Notably, the Llama wrapper never exhibited the silent-fabrication bug: its 400 clean rows are genuinely clean.

**The result, and why it is not comparable.** With the composite applied, Llama returned `pass` on all 400 defect pairs — 0.0% recall, an invariant verdict distribution. Two explanations are consistent with this: a capability gap (an 11B open-weights model may lack fine-grained visual-regression sensitivity), and a format artifact (the composite halves effective per-panel resolution, and the model received one image where the comparable judges received two). The composite was applied uniformly, so Phase 1 cannot disentangle them; no controls were dispatched to Llama, so its specificity is unmeasured. Cross-modal agreement values (κ = 0.000 against Claude on n=83; κ = 0.000 against Codex on n=175) are reported in the analyzer output for audit only — they are degenerate under an invariant marginal and are **not** evidence of a model-quality difference.

**Disentanglement protocol (queued).** Submit each defect pair to Llama twice — once as the composite, once as two sequential single-image calls with text-mediated comparison. Recall substantively above floor in single-image mode supports the format explanation; floor recall in both modes makes the capability explanation hard to escape. This sub-study is queued alongside Phase 2.

**Catalog lesson.** Judges must be input-format-matched or excluded from comparison. A workaround that changes modality rescues the dispatch, not the comparison.

---

## References

Barr, E. T., Harman, M., McMinn, P., Shahbaz, M., & Yoo, S. (2015). The oracle problem in software testing: A survey. *IEEE Transactions on Software Engineering*, 41(5), 507–525. https://doi.org/10.1109/TSE.2014.2372785

Bates, D., Mächler, M., Bolker, B., & Walker, S. (2015). Fitting linear mixed-effects models using lme4. *Journal of Statistical Software*, 67(1), 1–48. https://doi.org/10.18637/jss.v067.i01

Cicchetti, D. V., & Feinstein, A. R. (1990). High agreement but low kappa: II. Resolving the paradoxes. *Journal of Clinical Epidemiology*, 43(6), 551–558. https://doi.org/10.1016/0895-4356(90)90159-M

Cohen, J. (1960). A coefficient of agreement for nominal scales. *Educational and Psychological Measurement*, 20(1), 37–46. https://doi.org/10.1177/001316446002000104

Fan, A., Gokkaya, B., Harman, M., Lyubarskiy, M., Sengupta, S., Yoo, S., & Zhang, J. M. (2023). Large language models for software engineering: Survey and open problems. In *Proceedings of the 2023 IEEE/ACM International Conference on Software Engineering: Future of Software Engineering* (ICSE-FoSE '23) (pp. 31–53). IEEE. https://doi.org/10.1109/ICSE-FoSE59343.2023.00008

Feinstein, A. R., & Cicchetti, D. V. (1990). High agreement but low kappa: I. The problems of two paradoxes. *Journal of Clinical Epidemiology*, 43(6), 543–549. https://doi.org/10.1016/0895-4356(90)90158-L

Fleiss, J. L. (1971). Measuring nominal scale agreement among many raters. *Psychological Bulletin*, 76(5), 378–382. https://doi.org/10.1037/h0031619

Gelman, A., & Hill, J. (2007). *Data Analysis Using Regression and Multilevel/Hierarchical Models*. Cambridge University Press. ISBN 978-0-521-68689-1.

He, J., Shi, J., Zhuo, T. Y., Treude, C., Sun, J., Xing, Z., Du, X., & Lo, D. (2025). LLM-as-a-Judge for software engineering: Literature review, vision, and the road ahead. arXiv preprint arXiv:2510.24367. https://arxiv.org/abs/2510.24367 (To appear in *ACM Transactions on Software Engineering and Methodology*; DOI 10.1145/3797276.)

Holm, S. (1979). A simple sequentially rejective multiple test procedure. *Scandinavian Journal of Statistics*, 6(2), 65–70.

Hou, X., Zhao, Y., Liu, Y., Yang, Z., Wang, K., Li, L., Luo, X., Lo, D., Grundy, J., & Wang, H. (2024). Large language models for software engineering: A systematic literature review. *ACM Transactions on Software Engineering and Methodology*, 33(8), Article 220. https://doi.org/10.1145/3695988

Krawetz, N. (2013). Kind of like that. *The Hacker Factor Blog*. Retrieved from https://www.hackerfactor.com/blog/index.php?/archives/529-Kind-of-Like-That.html (dHash perceptual-hash algorithm specification.)

Landis, J. R., & Koch, G. G. (1977). The measurement of observer agreement for categorical data. *Biometrics*, 33(1), 159–174. https://doi.org/10.2307/2529310

Malhotra, S. (2026a). *Agent-harness: A reusable infrastructure for vision-LLM visual-assertion oracles on TodoMVC.* Manuscript under submission to the *Journal of Systems and Software* (Manuscript ID JSSOFTWARE-D-26-01260).

Malhotra, S. (2026b). *Specification enrichment for agent-harness LLM oracles.* Manuscript, under revision (previously under submission to *IEEE Software*).

Malhotra, S. (2026, June 6). *Visual Oracle Bench: Pre-registration of a multi-application LLM-as-Judge visual-regression benchmark.* Open Science Framework. https://doi.org/10.17605/OSF.IO/NKD6J (Amendment 1, 2026-06-11: Phase 1 correction protocol and control-pair extension.)

McNemar, Q. (1947). Note on the sampling error of the difference between correlated proportions or percentages. *Psychometrika*, 12(2), 153–157. https://doi.org/10.1007/BF02295996

Olianas, D., Leotta, M., & Ricca, F. (2026). BEWT: Extended benchmarking for end-to-end web testing. *Journal of Systems and Software*, 237, Article 112849. https://doi.org/10.1016/j.jss.2026.112849

Sjøberg, D. I. K., Dybå, T., & Jørgensen, M. (2007). The future of empirical methods in software engineering research. In *Future of Software Engineering (FOSE '07)* (pp. 358–378). IEEE Computer Society. https://doi.org/10.1109/FOSE.2007.30

Wang, Z., Bovik, A. C., Sheikh, H. R., & Simoncelli, E. P. (2004). Image quality assessment: From error visibility to structural similarity. *IEEE Transactions on Image Processing*, 13(4), 600–612. https://doi.org/10.1109/TIP.2003.819861

Wohlin, C., Runeson, P., Höst, M., Ohlsson, M. C., Regnell, B., & Wesslén, A. (2012). *Experimentation in Software Engineering* (2nd ed.). Springer. https://doi.org/10.1007/978-3-642-29044-2



