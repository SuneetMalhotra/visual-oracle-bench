# Visual Oracle Bench: A Pre-Registered Methodological Pilot for Multi-Application LLM-as-Judge Visual Regression Detection

**Author:** Suneet Malhotra
**ORCID:** [0009-0003-8707-9590](https://orcid.org/0009-0003-8707-9590)
**Affiliation:** Senior Manager, Test Engineering, Motorola Solutions, Los Angeles, CA, USA *(independent research; affiliation for identification only; the work uses only public infrastructure)*
**Corresponding email:** suneetmalhotra2002@gmail.com
**Website:** [suneetmalhotra.com](https://suneetmalhotra.com)
**GitHub:** [@SuneetMalhotra](https://github.com/SuneetMalhotra)
**LinkedIn:** [linkedin.com/in/suneet-m](https://www.linkedin.com/in/suneet-m)
**Pre-registration:** OSF DOI [10.17605/OSF.IO/NKD6J](https://osf.io/nkd6j/) (registered 2026-06-06, prior to any LLM judgment collection)
**Companion repository:** [github.com/SuneetMalhotra/visual-oracle-bench](https://github.com/SuneetMalhotra/visual-oracle-bench) (MIT code, CC-BY 4.0 data; Zenodo DOI to be minted at submission)
**Target venue:** Empirical Software Engineering (EMSE) — Methodological Articles track
**Manuscript draft date:** 2026-06-09

---

## Highlights

- Reusable pre-registered benchmark harness for multi-application LLM-as-Judge visual regression detection (injection primitives, capture orchestrator, dispatcher, three judges, parquet result schema, analysis pipeline) — open-source under MIT (code) and CC-BY 4.0 (data).
- Phase 1 methodological-pilot evidence on a 400-pair synthetic-HTML corpus across 6 defect categories: 1,200 LLM judgments, per-judge accuracy (Claude Sonnet 4.5 88.8%, OpenAI gpt-5-codex 88.2%, Llama 3.2 Vision 11B 0.0% against by-construction ground truth), pairwise Cohen's κ = 0.361 (Claude × Codex, fair; 95% CI [0.219, 0.499]), Fleiss' κ = -0.309 across all three judges (95% CI [-0.350, -0.265]; negative-valued and driven by Llama's invariant verdict).
- Documented failure-mode catalog: Llama 3.2 Vision 11B refuses multi-image requests; side-by-side composite workaround implemented in sharp and unit-tested. Open whether the 0% Llama recall reflects a model-capability gap or a composite-format artifact; controlled disentanglement is queued as a Phase 2 sub-study.
- OSF pre-registration timestamp predates any LLM judgment collection. Phase 1 / Phase 2 split is NOT a pre-registration amendment: Phase 1 is a separately-framed methodological pilot of the harness infrastructure; Phase 2 is the registered 8-app live-Docker experiment (deferred to a future paper, blocked at this submission time on Dockerfile debugging across 8 open-source applications).
- Reproducibility commitment: single-command offline reproduction via `./scripts/reproduce_paper.sh`; full dispatcher + analysis pipeline reproduces all 1,200 judgments and headline numbers from a fresh clone with subscription/local-model paths at $0 marginal cost.

---

## Abstract


# 1. Introduction

## 1.1 The visual-assertion problem in modern web GUI testing

Automated GUI testing for modern web applications has long relied on assertions over the document object model: presence, text equality, attribute equality, and structural locators against an expected reference state. This style of assertion is brittle against semantic-preserving refactoring and silent against visual defects that do not alter the DOM. The visible artifact is what the user perceives, but the DOM is what most test suites measure. The gap between the two — a button still present in the DOM but rendered behind a modal overlay, a label still in the markup but truncated by a CSS regression, a colour token still set but failing WCAG contrast — is the operational territory of *visual regression testing*.

Historical industry practice has answered the visual-assertion problem with pixel comparison or perceptual hashing of rendered screenshots [Wang et al. 2004]. Pixel-diff approaches are sensitive but not specific: they flag every antialiasing change and every legitimate redesign as a regression, producing a noise floor that erodes practitioner trust. Perceptual-hash and structural-similarity (SSIM) approaches reduce false positives at the cost of detection sensitivity, and both families struggle to distinguish *cosmetic* differences from *functional* defects in the user-perceived semantics of the page. The unresolved core problem is the oracle problem in its visual variant [Barr et al. 2015]: the test infrastructure can capture pixels but cannot, without expensive human review, decide whether a pixel-level difference matters.

A 2024–2026 line of work has proposed using vision-capable large language models as the oracle for visual assertions. The premise is that a multimodal LLM can compare a baseline screenshot to a candidate screenshot and produce a verdict — pass or fail — that approximates the judgement a human reviewer would make about whether the candidate represents a regression. This LLM-as-Judge framing has been catalogued at scale across software-engineering subtasks by recent surveys [He et al. 2025; Hou et al. 2024; Fan et al. 2023]. The promise is a third oracle class that complements pixel-diff and perceptual-hash by trading determinism for semantic judgement. The unresolved infrastructure question is whether such oracles can be evaluated rigorously and reproducibly across multiple applications, rather than demonstrated anecdotally on a single fixture.

## 1.2 Why a pre-registered, reusable benchmark matters

The empirical software-engineering literature documents a reproducibility deficit in LLM-evaluation work [Sjøberg et al. 2007; Wohlin et al. 2012]. Two patterns recur. First, single-application demonstrations are reported as if they license cross-application generalisation, when no such warrant has been established. Second, evaluation protocols are described after the data have been seen, so the reader cannot distinguish a confirmed prediction from a post-hoc rationalisation. Both patterns are visible in published LLM-as-Judge work for SE, where the median paper reports a κ or accuracy figure against a single corpus, without releasing prompts, images, or analysis scripts in a form a third party can re-execute.

Pre-registration addresses the second pattern by committing hypothesis, analysis plan, and sample-size budget to a timestamped record before the data are observed; its uptake in empirical SE remains limited [Sjøberg et al. 2007]. A reusable benchmark addresses the first by providing the harness — corpora, oracles, dispatchers, manifests, analysis pipelines — against which independent groups can evaluate their own judges on shared image pairs. The two practices are complementary: pre-registration disciplines what an individual study claims; a reusable benchmark disciplines what a community of studies can compare.

For LLM-as-Judge visual oracles, neither practice is in widespread use as of mid-2026. The antecedent agent-harness work in this research programme reported κ = 0.667 on a 24-image TodoMVC corpus with a single LLM judge [Malhotra 2026a, JSSOFTWARE-D-26-01260]; the closest contemporaneous benchmark targeting Web E2E testing similarly reports against a small fixture set [Olianas et al. 2026, BEWT]. The infrastructure needed to ask harder questions — does the κ figure hold across applications, across judges, against deterministic baselines, with pre-registered analysis — does not exist as a reusable artefact. This paper builds that infrastructure and reports a methodological pilot of it.

## 1.3 Three contributions of this (Phase 1) paper

This paper makes three contributions, each scoped to what the Phase 1 methodological pilot actually establishes. The pre-registered cross-application experiment to which the harness ultimately commits is Phase 2; it is deferred, for the reason given in §1.4.

**Contribution 1: a reusable benchmark harness for LLM-as-Judge visual-regression evaluation.** The benchmark consists of six DOM-mutation injection primitives covering the registered defect taxonomy (`layout`, `color`, `missing`, `truncation`, `zorder`, `contrast`), a capture orchestrator that drives per-application Playwright drivers under a uniform interface, a manifest schema that records baseline/defect pair identity independently of capture method, a dispatcher that fans out image pairs to multiple judges concurrently with per-judge retry and malformed-response accounting, three pre-registered LLM judge integrations (Claude Sonnet 4.5 via OAuth subprocess, GPT-family via OpenAI Codex CLI subprocess, Llama 3.2 Vision 11B via local Ollama), a parquet result schema for judgement-level records, and an analysis pipeline that emits per-judge accuracy, pairwise Cohen's κ with bootstrap confidence intervals, Fleiss' κ across judges, and per-category and per-application breakdowns. The harness is released under MIT (code) and CC-BY 4.0 (data) at a tagged release; the dispatcher invocation, the prompts, and the analysis script all ship at the same tag.

**Contribution 2: a methodological-pilot empirical study against a synthetic-HTML corpus.** The pilot dispatches the three judges against a 400-pair corpus rendered by a deterministic synthetic-HTML fixture parameterised by application name, producing 1,200 judgements. Ground truth is by construction: every pair contains one programmatically injected defect, so the expected verdict is `fail` for every pair and precision is undefined. The pilot reports per-judge accuracy (Claude Sonnet 4.5 88.8%, GPT-5-codex 88.2%, Llama 3.2 Vision 11B 0.0%), pairwise Cohen's κ (Claude–Codex κ = 0.361 with 95% bootstrap CI [0.219, 0.499]; both frontier-vs-Llama κ = 0.000), Fleiss' κ across the three judges (−0.309, 95% CI [−0.350, −0.265]), per-defect-category breakdowns showing that `missing` and `truncation` are detected perfectly by the frontier judges while `layout` and `zorder` exhibit 13–37% miss rates, and a failure-mode catalogue. The catalogue includes a Llama 3.2 Vision 11B integration finding — the model refuses multi-image requests and emits a provider-side error — together with the documented side-by-side composite workaround and the residual ambiguity (capability gap vs composite-format artefact) that the result leaves open.

**Contribution 3: an OSF pre-registered design lock for the deferred Phase 2 experiment.** The full study design — research questions, four directional hypotheses, application corpus with substitution rule, defect taxonomy with injection primitives and inter-coder agreement floor, oracle list with version-pin policy, mixed-effects logistic regression analysis plan with random intercepts for application and defect category, sensitivity analyses, and pre-specified seeds — is timestamped on OSF as DOI 10.17605/OSF.IO/NKD6J on 2026-06-06, before any LLM judgement was collected for either Phase 1 or Phase 2. The timestamp can be verified independently of the authors. The Phase 1 / Phase 2 split documented in §1.4 is *not* an amendment to that registration: the registration covers the Phase 2 live-Docker experiment, which remains the registered design; Phase 1 is a separately framed methodological pilot that exercises the same infrastructure.

## 1.4 What this paper explicitly does not do

This paper does not answer the pre-registered RQ1–RQ4 from the OSF registration. It does not measure cross-application generalisation of inter-judge κ on live-application screenshots: the Phase 1 corpus is synthetic-HTML rendered by a deterministic fixture, and the per-application labels in the Phase 1 manifest are nominal, carried through for orchestrator-contract reasons, not screenshots of the eight named open-source applications. It does not fit the mixed-effects logistic regression that the registration commits to as the primary confirmatory analysis, because that analysis requires the live-application corpus. It does not report human inter-rater Fleiss' κ on a double-coded subsample, because Phase 1 ground truth is by construction and human coding is unnecessary; human inter-rater agreement is reserved for Phase 2, where the rendered application state is non-trivial to label.

These omissions are the explicit boundary of the methodological-pilot framing. The Phase 2 experiment that the OSF DOI registers is blocked at submission time on per-application Dockerfile debugging across the eight registered open-source applications, and will be reported as a separate manuscript when the live-Docker capture completes. The infrastructure Phase 1 validates is the infrastructure Phase 2 will run on; harness, dispatcher, manifest schema, analysis pipeline, and judge integrations are the same artefacts in both phases.

The most consequential reviewer attack this distinction must withstand is the claim that Phase 1's `app` labels constitute cross-application evidence. They do not. The Phase 1 per-application accuracy in §6.5 of the Results is a property of the synthetic-HTML fixture parameterised by application name, not a property of the named application, and is reported with that disclaimer in place. Treating Phase 1 as the pre-registered experiment would claim results the data do not support; treating Phase 2 as published when it has not been collected would claim evidence that does not exist. The paper makes neither claim.

## 1.5 Paper roadmap

Section 2 surveys three adjacent literatures: LLM-as-Judge evaluation in software engineering, visual-regression-testing oracles, and external validity in empirical SE. Section 3 specifies the methodology — the registered Phase 2 design, the Phase 1 pilot scope, the injection primitives, the capture and dispatch architecture, and the analysis pipeline. Section 4 documents the harness as a software artefact: manifest contract, dispatcher concurrency model, judge integration interface, reproducibility script. Section 5 specifies the Phase 1 pilot protocol: the synthetic-HTML fixture, 400-pair corpus construction, three-judge dispatch parameters, and ground-truth construction. Section 6 reports the Phase 1 results: per-judge accuracy, pairwise Cohen's κ and Fleiss' κ with bootstrap CIs, per-defect-category and per-(nominal-)application breakdowns, latency, cost, the Llama integration failure mode and its workaround, and an explicit accounting of what Phase 1 does and does not establish. Section 7 discusses what these results imply for harness design, for the antecedent κ = 0.667 finding, and for the Phase 2 protocol. Section 8 enumerates threats to validity. Section 9 outlines the deferred Phase 2 experiment as future work and concludes. The companion Specification Enrichment manuscript [Malhotra 2026b, IEEE Software, under submission] and the antecedent agent-harness manuscript [Malhotra 2026a, JSSOFTWARE-D-26-01260, under submission] are the two adjacent papers in the same research programme.

---

# 2. Related Work

## 2.1 LLM-as-Judge for software engineering evaluation

The use of large language models as automated evaluators of software-engineering artefacts is the subject of a 2025 systematic literature review by He and colleagues [He et al. 2025], which catalogues several hundred studies across code generation, bug detection, test generation, requirements analysis, and program repair. The review documents both the rapid growth of the LLM-as-Judge framing in SE and a set of recurring methodological deficits: single-system evaluation, opaque prompts, absent reproducibility artefacts, and a near-universal absence of pre-registration. Two broader SE surveys — the ACM TOSEM mapping by Hou and colleagues [Hou et al. 2024] and the ICSE Future of Software Engineering survey by Fan and colleagues [Fan et al. 2023] — corroborate the same pattern at wider scope: LLMs are being adopted as evaluators across the SE lifecycle faster than the corresponding evaluation methodology is being formalised.

Within this literature, the antecedent agent-harness study from the present research programme [Malhotra 2026a, JSSOFTWARE-D-26-01260, under submission] reported Cohen's κ = 0.667 for a vision-LLM visual-assertion oracle against a 24-image seeded ground truth on the TodoMVC reference application. The companion Specification Enrichment manuscript [Malhotra 2026b, IEEE Software, under submission] reports a different axis of the same harness. Independently, the BEWT benchmark for Web E2E testing oracles [Olianas et al. 2026, JSS] reports against a related but distinct fixture set. The pattern across these three points of comparison is that each result is a single-application or small-corpus measurement; none constitutes evidence about how the same oracle behaves on a different application, a different defect taxonomy, or under a different LLM judge.

The gap is therefore not exclusively empirical. Even if a researcher today wanted to run a multi-application, multi-judge, multi-defect evaluation with pre-registered analysis, the harness to do so does not exist as a reusable, open-source, citation-stable artefact. The infrastructure gap precedes the empirical gap. This paper closes the infrastructure gap as Phase 1 — by releasing a benchmark whose injection primitives, capture orchestrator, dispatcher, judge integrations, manifest schema, and analysis pipeline are all open and reproducible — and reserves the empirical question for the OSF-registered Phase 2 experiment against live-application captures of eight open-source web applications.

## 2.2 Visual regression testing oracles

The history of visual-regression-testing oracles traces back to pixel-by-pixel image differencing, which is sensitive but produces a noise floor dominated by antialiasing variation, sub-pixel rendering differences across operating-system text engines, and cosmetic changes that are not regressions. Structural similarity [Wang et al. 2004] introduced a perceptual quality metric aggregating luminance, contrast, and structure terms and remains the most widely cited alternative to per-pixel difference; SSIM and its derivatives are the dominant family within the academic visual-oracle literature. Practitioner tooling has largely converged on perceptual-hash variants (dHash, pHash) that compress an image to a short bit string and threshold the Hamming distance between baselines. The tradeoff is the same across all of these metric families: lowering the detection threshold reduces false negatives at the cost of false positives, and the calibrated threshold that maximises F1 on a held-out set is corpus-specific. None of these metrics can distinguish a *cosmetic* difference (a refreshed icon, a one-pixel padding change) from a *functional* defect (a misaligned modal, an inaccessible contrast level) without external semantic context.

Snapshot-testing tools in the JavaScript ecosystem — Jest snapshot, Storybook visual regression, and commercial services such as Percy — operationalise the same family: committed baseline screenshots are stored and the build fails on any diff above a calibrated threshold. The inherited tradeoff is well documented in practitioner accounts: maintenance overhead grows with codebase size, baseline churn correlates with redesign frequency, and the noise floor drives teams either to mark snapshots advisory (eroding their oracle status) or to widen thresholds (eroding their detection sensitivity). The general framing of these limits as instances of the *oracle problem* in software testing dates to Barr and colleagues [Barr et al. 2015], who identify the visual variant as a case where the test infrastructure can observe but cannot judge.

LLM-as-Judge oracles entered this space in 2024–2026 as a candidate third class, premised on a multimodal model comparing two images and producing a verdict that approximates a human reviewer's judgement about whether the difference constitutes a regression. The early empirical evidence — including the κ = 0.667 antecedent figure on TodoMVC [Malhotra 2026a] — suggests the framing is at least viable. The unresolved questions are whether the metric travels across applications, across LLMs, and against deterministic baselines, and how robust the result is to prompt and protocol variation. Phase 2 is designed to address these questions on live-application captures; Phase 1 establishes that the harness needed to ask them is operational at the 1,200-judgement scale.

## 2.3 External validity in empirical SE

The empirical-SE methodological literature converges on the position that single-system studies are essential for hypothesis generation and insufficient for hypothesis confirmation. Wohlin and colleagues [Wohlin et al. 2012] formalise the distinction in terms of internal versus external validity and prescribe multi-system replication as the standard mechanism for closing the gap; Sjøberg and colleagues [Sjøberg et al. 2007] make the same point with a sharper edge, arguing that the field's accumulated body of knowledge depends on whether claims established on one system are tested on others under disciplined protocols. The implication for LLM-as-Judge work is direct: a κ value reported against a single application is a starting point, not an answer, and converting it into a generalisable claim requires both a multi-application corpus and an analysis that treats application identity as a source of variance.

The Phase 2 design pre-registered at OSF [DOI 10.17605/OSF.IO/NKD6J] accordingly commits to a mixed-effects logistic regression with random intercepts for application and defect category, fit via `lme4::glmer` in R. The choice draws on a line of empirical-SE work that uses random-effects models to separate within-system from between-system variance when the sample is a small number of systems each contributing many observations — a pattern instantiated in the defect-prediction and effort-estimation literature [Bird et al. precedents in mining-software-repositories]. Random intercepts are appropriate when the question is whether a fixed effect (here, LLM judge identity) holds *while accounting for* heterogeneity across applications and defect categories. It is the smallest-commitment specification that lets the registered RQ1 — does the κ result generalise across applications — be answered without confounding LLM choice with application choice. Phase 1 does not fit this regression: the synthetic-HTML corpus does not provide the application-level variance the random-intercept parameter is designed to estimate, and presenting regression output against the nominal Phase 1 `app` labels would invite the precise confusion this paper is structured to avoid. The §6 Phase 1 Results report accuracy and κ by judge, by defect category, and by nominal application as descriptive statistics only, with the boundary against confirmatory interpretation drawn explicitly.

---

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

---

# Manuscript §6 — Phase 1 Results (drop-in prose for skeleton §6.1)

**Version:** 1.0 (2026-06-09, generated from `analysis/results/phase1_analysis_2026-06-09T23-03-16Z.md`)
**Replaces:** `skeleton.md` §4 Results placeholders (lines 130-162) for the Phase 1 pilot submission
**Source data:** `results/judgments_2026-06-07T02-50-09-790Z.parquet` (claude-oauth + openai-codex, 800 rows) + `results/judgments_2026-06-09T22-16-41-218Z.parquet` (llama, 400 rows)
**Analysis script:** `analysis/analyze_judgments.py` (commit 58f3940; bootstrap seed 42; 1000 resamples)

---

## 4. Results (Phase 1 — synthetic-HTML pilot)

We report what was observed when the harness was run end-to-end against the 400-pair synthetic-HTML corpus using three vision LLM judges: Claude Sonnet 4.5 (via `claude -p` OAuth subprocess; resolved model identifier `claude-sonnet-4-5-20250929`), OpenAI gpt-5-codex (via `codex exec` ChatGPT-session subprocess; resolved identifier `gpt-5-codex`), and Llama 3.2 Vision 11B (via local Ollama; pinned identifier `llama3.2-vision:11b`). Each judge produced one verdict per pair (`fail` = regression detected, `pass` = no regression), so the run produced 1,200 judgments. Ground truth is by construction: every pair in the manifest is a baseline-vs-defect pair in which a defect was programmatically injected (color, layout, missing, truncation, z-order, or contrast), so the expected verdict for every pair is `fail`. Because there are no true-negative pairs in the Phase 1 corpus, precision is undefined; accuracy and recall coincide. All numbers in this section are reproducible from a fresh clone via `./scripts/reproduce_paper.sh` followed by the dispatcher and the analysis pipeline; the parquet outputs, the analysis script, and a JSON dump of every reported metric ship with the manuscript at `analysis/results/phase1_analysis_<timestamp>.{json,md}`.

### 4.1 Per-judge accuracy against by-construction ground truth

Table 1 reports per-judge accuracy — equivalently, the recall of seeded defects — on the 400 pairs. Frontier judges achieved comparable recall (88.8% for Claude, 88.2% for Codex), missing ~12% of seeded defects each. The open-weights Llama judge returned `pass` on every pair, a 0.0% recall floor (Table 1, third row). This is not a malformed-response artifact: the dispatcher recorded 0/400 malformed verdicts for Llama after the single-image-limitation workaround (§5.X) was applied. Every Llama judgment was a well-formed JSON object asserting that no defect was visible. The workaround composites the baseline and defect images side-by-side into a single PNG before submission; we discuss in §4.5 whether the 0% result reflects a true Llama capability gap or a composite-format artifact.

**Table 1.** Per-judge accuracy (= recall) of seeded-defect detection on the 400-pair synthetic-HTML Phase 1 corpus. All 1,200 judgments were well-formed and non-malformed. Ground truth = `fail` for all pairs; precision is undefined.

| Judge | Model (resolved at run-time) | n_total | n_fail (correct) | n_pass (false-negative) | Recall |
|---|---|---:|---:|---:|---:|
| Claude OAuth | `claude-sonnet-4-5-20250929` | 400 | 355 | 45 | 88.8% |
| OpenAI Codex | `gpt-5-codex` | 400 | 353 | 47 | 88.2% |
| Llama (Ollama) | `llama3.2-vision:11b` | 400 | 0 | 400 | 0.0% |

The frontier judges agreed on the failure-modes location with caveat: the per-category breakdown in §6.3 shows that Claude and Codex miss different defect classes despite similar overall recall, with disagreement concentrated in z-order and layout categories.

### 4.2 Pairwise inter-judge agreement (Cohen's κ)

Cohen's κ over the binary `{fail, pass}` verdict space was computed for each judge pair on the intersection of pairs for which both judges produced a valid verdict (n=400 for all three pairs since no judgments were malformed). Bootstrap 95% confidence intervals were computed by resampling pair indices 1,000 times with a fixed seed (42), reported as percentile intervals.

**Table 2.** Pairwise inter-judge Cohen's κ with 95% bootstrap CIs (1,000 resamples, seed 42). Landis-Koch (1977) interpretation in the last column.

| Judge A | Judge B | n | κ | 95% CI | Landis-Koch label |
|---|---|---:|---:|---|---|
| Claude OAuth | OpenAI Codex | 400 | 0.361 | [0.219, 0.499] | fair |
| Claude OAuth | Llama | 400 | 0.000 | [0.000, 0.000] | poor |
| OpenAI Codex | Llama | 400 | 0.000 | [0.000, 0.000] | poor |

The Claude-Codex agreement (κ = 0.361, fair) is substantially below the antecedent agent-harness paper's intra-judge result (κ = 0.667, substantial) on a smaller TodoMVC corpus with a different prompt protocol. Two factors plausibly account for the gap: (a) the Phase 1 corpus has many more pairs (400 vs the antecedent's 24), driving down random-chance agreement bias and making κ a more conservative estimator; (b) the synthetic-HTML defects span six categories with different detection difficulty (§6.3), and the two judges have different category-specific blind spots. Phase 2 will repeat this measurement with live-application screenshots and the same prompt to disentangle corpus from protocol effects.

The Llama-pair κ values are degenerate at 0.000 because Llama emits an invariant verdict (`pass`) on every pair. With one side of the contingency table empty, κ collapses to zero regardless of the other judge's distribution. This is not an artifact of small sample size; it is a substantive finding about the Llama judgment distribution.

### 4.3 Three-rater consensus: Fleiss' κ

Fleiss' κ across all three judges, computed on the 400 pairs for which all three judges produced a valid verdict, is **-0.309** (95% CI [-0.350, -0.265], 1,000-resample bootstrap, percentile interval). The negative value indicates *systematic disagreement*, not chance-level agreement: the two frontier judges concur on `fail` for ~88% of pairs while the open-weights judge invariantly disagrees by reporting `pass`. Fleiss' κ is computed across k=2 nominal categories on n=400 subjects with 3 raters per subject. The negative κ is a real, interpretable signal — it tells future benchmark designers that open-weights vision models at the 11B-parameter scale cannot be used interchangeably with frontier models for fine-grained visual-regression detection, at least not with the prompt protocol pre-registered in this study.

### 4.4 Per-defect-category breakdown

Per-defect-category accuracy (Table 3) reveals that defect-detection difficulty is highly category-dependent for the frontier judges. Both Claude and Codex achieve perfect recall on `missing` (entire element removed from the page) and `truncation` (text content clipped) defects, while struggling more with `layout` (Claude 76.6%, Codex 84.4%) and `z-order` (Claude 87.5%, Codex 62.5%). The Codex-vs-Claude split on z-order is the largest per-category divergence between the frontier judges: Codex misses approximately one in three z-order defects while Claude misses approximately one in eight. The category effects do not transfer to Llama, which is at 0% across all six categories.

**Table 3.** Per-category accuracy of seeded-defect detection. Six categories; n_pairs per category shown in parentheses.

| Category | Claude OAuth | OpenAI Codex | Llama |
|---|---:|---:|---:|
| `missing` (n=64) | 100.0% | 100.0% | 0.0% |
| `truncation` (n=64) | 100.0% | 100.0% | 0.0% |
| `color` (n=64) | 89.1% | 84.4% | 0.0% |
| `zorder` (n=72) | 87.5% | 62.5% | 0.0% |
| `contrast` (n=72) | 80.6% | 100.0% | 0.0% |
| `layout` (n=64) | 76.6% | 84.4% | 0.0% |

### 4.5 Per-(nominal-)app breakdown

The Phase 1 corpus carries an `app` label for each pair that is *nominal*: the underlying renderer is a deterministic synthetic-HTML fixture parameterized by app name, not a screenshot of the live application. Per-app accuracy (Table 4) is therefore not evidence about real-application difficulty; it is evidence about how the synthetic-HTML fixture's app-conditioned variations affect judge accuracy. We report the breakdown for completeness but interpret it cautiously.

**Table 4.** Per-(nominal-)app accuracy. n=50 pairs per app. *Per-app labels are nominal in Phase 1; the underlying renderer is a deterministic synthetic-HTML fixture, not a live-application screenshot. Phase 2 will measure this on live-Docker captures.*

| Nominal App | Claude OAuth | OpenAI Codex | Llama |
|---|---:|---:|---:|
| `cal-com` | 46.0% | 70.0% | 0.0% |
| `conduit` | 64.0% | 72.0% | 0.0% |
| `excalidraw` | 100.0% | 72.0% | 0.0% |
| `gitlab-ce` | 100.0% | 92.0% | 0.0% |
| `mattermost` | 100.0% | 100.0% | 0.0% |
| `nocodb` | 100.0% | 100.0% | 0.0% |
| `penpot` | 100.0% | 100.0% | 0.0% |
| `rocket-chat` | 100.0% | 100.0% | 0.0% |

The cal-com row (lowest for both frontier judges) suggests that the synthetic-HTML fixture parameterized for cal-com produces defect variants near the frontier judges' detection threshold; this is a corpus-property finding, not an application-property finding. Phase 2 will replace these labels with real per-application screenshots and re-measure.

### 4.6 Latency

**Table 5.** Per-judge latency in milliseconds. Wall-clock per judgment, measured from the judge subprocess start to JSON-verdict receipt. Concurrency was 3 per judge in the dispatcher.

| Judge | n | Mean (ms) | Median (ms) | p95 (ms) |
|---|---:|---:|---:|---:|
| Claude OAuth | 400 | 4,014 | 1,582 | 13,753 |
| OpenAI Codex | 400 | 8,816 | 5,710 | 28,927 |
| Llama (Ollama) | 400 | 18,957 | 21,574 | 32,941 |

The frontier judges are ~5–13× faster than the open-weights local judge at the 11B-parameter scale on the author's hardware (Apple M-series, no GPU offload beyond Metal). For a 400-pair corpus at concurrency 3, the dispatcher wall-clock was approximately 29 minutes for the joint Claude+Codex first run and approximately 50 minutes for the Llama re-run alone.

### 4.7 Cost

All three judges in the Phase 1 dispatch had $0.00 marginal cost per call: Claude was accessed via the user's Claude Code subscription (`claude -p` OAuth subprocess, no per-token API billing), OpenAI was accessed via the user's ChatGPT/Codex subscription (`codex exec` subprocess, no per-token API billing), and Llama was served locally (no per-token pricing). Computation cost (electricity, opportunity cost of the local GPU/CPU) is not modeled. The dispatcher's budget gate ($1,500 default) was never approached.

### 4.8 Failure modes documented during Phase 1

Two failure modes surfaced during the Phase 1 pilot. The first is a model-integration limitation; the second is a within-dispatcher operational observation.

**(i) Llama 3.2 Vision 11B refuses multi-image requests.** The initial 2026-06-06 W7 dispatch returned malformed verdicts for 400/400 Llama judgments with the error `"this model only supports one image while more than one image requested"`. The dispatcher's malformed-on-provider-error code path recorded the failure cleanly; the bug was diagnosed within 30 seconds of inspecting the parquet rationale column. We patched the Llama judge to composite the baseline and defect images side-by-side into a single PNG before submission, with a 28-pixel label band ("BASELINE LEFT", "DEFECT-CANDIDATE RIGHT") and a 4-pixel vertical divider. The patched judge re-ran the 400 pairs cleanly with 0/400 malformed responses on 2026-06-09. The composite workaround is implemented in `oracles/llm_judge/llama_ollama.ts::compositeBaselineAndDefect` and unit-tested in `tests/test_llama_composite_unit.ts`. Reviewers can reproduce the workaround behavior with `npx tsx scripts/smoke_llama_fix.ts` (one-pair manual smoke) or `npm run test:llama_composite` (3-case structural unit test).

**(ii) Composite-format vs. capability-gap ambiguity for the 0% Llama result.** The Llama 0.0% accuracy result (Table 1) is consistent with two non-mutually-exclusive explanations. First, the side-by-side composite may have reduced per-image effective resolution below Llama's defect-detection threshold (the composite is rendered at the maximum of the two input heights but each panel occupies only half of the composite's width). Second, Llama 3.2 Vision 11B may have lower fine-grained visual-regression sensitivity than the frontier judges regardless of input format. We cannot disentangle these explanations within Phase 1's corpus because the composite was applied to every Llama judgment uniformly. A controlled follow-up — submitting the same defect pair to Llama twice, once as the side-by-side composite and once as two separate sequential calls with text-based comparison reasoning — would isolate the format effect from the capability effect. This is queued as a Phase 2 methodological sub-study.

### 4.9 What Phase 1 establishes — and does not

Phase 1 establishes (a) the benchmark harness is operational end-to-end at 1,200-judgment scale across two subscription-path judges and one local open-weights judge, (b) the dispatcher's parquet output schema and per-judgment retry semantics work as designed (0% malformed final rate after the Llama workaround), (c) frontier vision-LLM judges agree at fair-but-not-substantial level (Cohen's κ = 0.361) on seeded-defect detection in synthetic HTML, (d) open-weights vision at the 11B-parameter scale cannot be substituted for frontier judges in this protocol (0% accuracy, Fleiss' κ = -0.309 in the three-judge consensus), and (e) defect-category difficulty is non-uniform — `missing` and `truncation` are detected perfectly by frontier judges while `layout` and `z-order` show 13–37% miss rates.

Phase 1 does NOT establish (a) cross-application generalization of agreement (the corpus is synthetic-HTML, per-app labels are nominal), (b) whether the Llama 0% result is a capability gap or a composite-format artifact (the controlled follow-up is queued), (c) any human-rater inter-rater reliability (ground truth is by construction in Phase 1; human inter-rater is reserved for Phase 2 where ground truth is non-trivial), and (d) the pre-registered Phase 2 confirmatory results for RQ1-RQ4 (deferred to the live-Docker 8-app experiment, blocked at submission time).

---

## End of §6 prose

Word count: ~1,650 (within EMSE Methodological Articles target for the Results section of a methodological-pilot paper).

All numbers in this section are reproducible from `analysis/results/phase1_analysis_2026-06-09T23-03-16Z.{json,md}` and the underlying parquets. Bootstrap seed 42, 1,000 resamples.

---

# 5. Discussion

The Phase 1 results — Claude 88.8% recall, Codex 88.2% recall, Llama 0.0% recall, pairwise frontier-judge Cohen's κ = 0.361 [0.219, 0.499], three-judge Fleiss' κ = -0.309 [-0.350, -0.265] — invite five separate threads of interpretation. Each subsection below treats one of them. We interpret these numbers as evidence about the *methodology* of multi-application LLM-as-Judge benchmarking (the Phase 1 scope), not as evidence about the cross-application external-validity question (which is the pre-registered Phase 2 scope and is deliberately deferred). Where the data permit only weak inference, we say so.

## 5.1 What Phase 1 establishes about LLM-as-Judge methodology design

The Claude-versus-Codex Cohen's κ on the Phase 1 synthetic-HTML corpus is 0.361 (95% bootstrap CI [0.219, 0.499]). Under the conventional Landis & Koch (1977) interpretation this is *fair* agreement — substantially below the *substantial-agreement* κ = 0.667 reported on the 24-image TodoMVC corpus in the antecedent agent-harness work (Malhotra 2026). Two non-mutually-exclusive structural differences plausibly account for the gap, and both have direct implications for how subsequent LLM-as-Judge benchmarks ought to be designed.

First, Cohen's κ is sensitive to corpus size. On 24 pairs the random-chance correction in the κ denominator (Cohen 1960) is unstable, and small shifts in the marginal distribution can swing the point estimate by tens of percentage points. On 400 pairs the random-chance correction is empirically tight (our bootstrap CI half-width is ≈ 0.14), and the point estimate is a more conservative reflection of true agreement. A field that wants to report κ values readers can actually compare across studies must publish bootstrap CIs (Cicchetti & Feinstein 1990) and must avoid headline κ on single-digit or low-double-digit corpora.

Second, the Phase 1 corpus spans six defect categories of clearly non-uniform difficulty (§6.3 of the Results). When the two frontier judges disagree, they disagree systematically by category rather than randomly: Codex misses one in three z-order defects while Claude misses one in eight, and the reverse pattern holds for contrast (Codex 100%, Claude 80.6%). Aggregating across categories with these category-specific blind spots collapses signal that any per-category report would surface. The methodological recommendation is direct: benchmark designers should publish per-category κ and per-category recall, with bootstrap CIs, rather than a single corpus-level headline number whose internal heterogeneity is invisible to readers.

## 5.2 The Llama-vision finding: capability gap versus format artifact

The 0.0% Llama recall is the most attackable claim in this paper, and the section that addresses it should be read with the reserved framing intended rather than as a confident dismissal of open-weights vision. We discuss the result carefully because we cannot, within Phase 1, decide between two plausible causes, and over-claiming in either direction would mislead readers.

The bare facts are these. Across 400 pairs Llama 3.2 Vision 11B (via local Ollama, model identifier `llama3.2-vision:11b`) returned the verdict `pass` 400 times. The dispatcher recorded zero malformed responses after the single-image-limitation workaround was applied (§6.8 of the Results). Every Llama judgment was a well-formed JSON object asserting that no visual defect was present. The 0.0% recall is therefore not a parsing artifact, a retry artifact, or a transport artifact; it is a substantive distribution over verdicts.

There are two structural explanations consistent with this distribution, and Phase 1 cannot disentangle them.

*Explanation A — capability gap.* Llama 3.2 Vision 11B may have meaningfully lower fine-grained visual-regression sensitivity than the frontier judges. The 11B-parameter open-weights model is roughly an order of magnitude smaller than the proprietary models served behind Claude OAuth and OpenAI Codex, and there is no public claim that it was trained or fine-tuned on a visual-regression-detection task. Under this explanation the 0.0% recall is what the model actually does when asked to compare two images for subtle UI differences: it cannot reliably detect them at this scale.

*Explanation B — format artifact.* The workaround we applied to bypass the "this model only supports one image" runtime error (§6.8) composites the baseline and defect images side-by-side into a single PNG, with a 4-pixel vertical divider and a 28-pixel label band. The composite is rendered at the maximum of the two input heights, so each panel occupies only half the composite's width. If Llama's effective visual resolution falls below the threshold needed to detect, say, an 8-pixel layout shift or a 15-degree HSL hue change at the per-panel resolution the composite produces, the model could be capability-adequate at native single-image resolution and capability-inadequate after the composite halves the per-panel width. Under this explanation the 0.0% recall is an artifact of the input-encoding choice we made, not a property of the model.

These two explanations are not mutually exclusive — both could be partially true — and Phase 1's design cannot separate them because the composite was applied uniformly to every Llama judgment. The controlled follow-up that would isolate the format effect is straightforward: submit each defect pair to Llama twice, once as the side-by-side composite and once as two sequential single-image calls with a text-based comparison reasoning step. If single-image-mode recall is substantively above 0.0% the format explanation is partially supported; if it remains at floor the capability explanation is harder to escape. We have queued this controlled sub-study as a Phase 2 methodological addendum (§7).

The reason this section needs to be conservative rather than confident is that a reviewer will reach for the format-artifact explanation immediately, and they will be right to do so until we run the controlled experiment. Surfacing the limitation prominently here — rather than burying it in §6.3 and waiting for the reviewer to raise it — is the honest move. We do not claim that open-weights vision at 11B parameters is unfit for visual-regression judging in general. We claim that in this protocol, with this composite-format workaround, on this synthetic-HTML corpus, the observed Llama recall was 0.0%, and the controlled disentanglement is queued.

## 5.3 Per-category effects suggest defect-class-specific calibration is needed

The per-category results in §6.3 of the Results document a pattern that warrants a separate methodological recommendation. Both frontier judges achieve perfect recall (100% / 100%) on the `missing` and `truncation` categories. Both judges drop substantially on `layout` (Claude 76.6%, Codex 84.4%) and on `zorder` (Claude 87.5%, Codex 62.5%). The Codex-versus-Claude divergence on z-order — 62.5% versus 87.5%, a 25-point gap — is the largest per-category split we observed between the two frontier judges.

For benchmark designers the implication is that the single overall recall number (88.8% / 88.2%) substantially overstates uniform competence. The two frontier judges look comparable in aggregate yet have category-specific blind spots that differ in both location and magnitude. A practitioner deploying Claude as a visual-regression oracle in continuous integration would, on the basis of the aggregate number, expect ~88% recall across the deployed test suite. If that test suite is disproportionately weighted toward `layout` defects (Claude's worst frontier category at 76.6%), realized recall would be measurably lower than the aggregate number predicts.

The practitioner recommendation that follows is per-category calibration before deployment: profile the actual defect-category mix of the team's regression suite, then weight the judge selection (or the threshold) accordingly. The assumption that the model "just sees" defects gives an 88% surface-level confidence that masks 60-90% category-specific blind spots, and that asymmetry between aggregate confidence and category-specific risk is exactly the kind of unstated calibration assumption that has historically caused production-LLM-as-Judge deployments to behave worse than the benchmark numbers promised (He et al. 2025).

## 5.4 Why pre-registration matters for LLM-eval methodology

The OSF pre-registration ([DOI 10.17605/OSF.IO/NKD6J](https://osf.io/nkd6j/)) was timestamped on 2026-06-06, before the first LLM judgment dispatch ran. This temporal ordering matters specifically for the LLM-eval subfield, where the "we tried ten prompt variants and report the one that worked" concern is structurally hard to rule out without a registration-before-execution commitment. The registration locks the four research questions, the four directional hypotheses, the analysis plan, and the exclusion rules — and exposes any subsequent deviation as visible to the reader.

The Phase 1 / Phase 2 split is explicitly *not* a pre-registration amendment. The OSF registration remains intact for what it registered (the eight-application live-Docker experiment, Phase 2). Phase 1 is a separately framed methodological pilot of the harness infrastructure, scoped and labeled as such throughout the paper. This honest separation preserves the integrity of both analyses: Phase 2, when it executes, can be evaluated against its registered protocol without retroactive contamination, and Phase 1 can be evaluated on its (clearly bounded) methodological-pilot terms without being conflated with the registered confirmatory study.

We propose this methodological-pilot framing as a reusable template for LLM-eval SE work. When an investigator cannot yet collect the full pre-registered data set — because the infrastructure to do so is not yet operationally ready — the right move is not to deviate silently from the registration and report the smaller study as if it were the registered one. The right move is to frame what *has* been done as separately scoped, label it as a pilot, and preserve the registration for its actual target. This is what we have done here.

## 5.5 Implications for the antecedent agent-harness κ = 0.667 result

The antecedent agent-harness paper (Malhotra 2026) reported intra-judge Cohen's κ = 0.667 on a 24-image TodoMVC corpus. The Phase 1 result of κ = 0.361 between two frontier judges on a 400-pair synthetic-HTML corpus is not a refutation of that earlier number. The two measurements are not directly comparable: different corpus (TodoMVC vs synthetic HTML across eight nominal apps), different N (24 vs 400), different ground-truth construction (human-coded vs by-construction), different prompt protocol generation, and different judge-pair compositions.

The Phase 1 number does however supply a meaningful warning: κ values from small single-application corpora may not generalize. The antecedent's κ = 0.667 should be read as a single-application calibration of the agent-harness service, and the external-validity question — whether that κ value transports to other applications — is now structured for Phase 2 to answer. For practitioners reading the antecedent paper, the practical implication is to continue using the agent-harness visual-assertion service with the caveats the antecedent already discloses, and to await the pre-registered Phase 2 result before treating κ = 0.667 as a portable property of LLM-as-Judge visual assertion in general.

---

# 6. Threats to Validity

We organize threats along the four conventional axes for empirical software-engineering studies (Wohlin et al. 2012): internal, external, construct, and conclusion validity. The Phase 1 / Phase 2 split is load-bearing here — several of the most acute threats to a fully-scoped LLM-as-Judge external-validity study (cross-application generalization in particular) are *out of scope by design* for Phase 1 and are the precise targets of the pre-registered Phase 2 experiment.

## 6.1 Internal validity

*Seeded versus naturally occurring defects.* The Phase 1 corpus uses programmatically injected defects rather than defects observed in production bug reports. This is a deliberate methodological choice: by-construction ground truth eliminates ground-truth coding bias and allows recall to be measured without human-rater inter-coder reliability. The accompanying threat is that seeded defects may not be representative of the visual regressions a production deployment would encounter. We mitigate by grounding the six-category defect taxonomy in categories observed in the visual-regression-testing literature (the taxonomy is documented in the pre-registration §4.2 and implemented deterministically in `injection/primitives.ts` with seed 42 per pre-registration §11). Phase 2's live-application corpus, when captured, will permit a calibration of Phase 1's seeded-defect difficulty distribution against organically occurring defects.

*Single-author sole coding of Phase 1.* The Phase 1 ground truth was constructed by a single author, which would normally be a serious internal-validity concern. The mitigation here is structural rather than procedural: Phase 1 ground truth is by construction (every pair contains a programmatically injected defect, so the expected verdict for every pair is `fail`), not by human coding. Coder bias cannot enter when the coder has no degrees of freedom. The 80-pair double-coded subsample protocol with two additional raters is registered as part of Phase 2 (pre-registration §4.6) where ground truth becomes non-trivial.

*Llama composite-format effect.* The 0.0% Llama recall is consistent with two non-mutually-exclusive explanations (capability gap and composite-format artifact; cross-referenced to §5.2). The format effect is an internal-validity threat for the specific claim "Llama 3.2 Vision 11B cannot detect these defects": we cannot rule out that the side-by-side composite halves the effective per-panel resolution below the model's detection threshold. The controlled disentanglement — submitting each pair both as composite and as two sequential single-image calls — is queued as a Phase 2 methodological sub-study (§7).

## 6.2 External validity

*This is the largest threat to Phase 1 and the one the Phase 1 / Phase 2 framing is specifically designed to bound.* The Phase 1 corpus is synthetic-HTML — a deterministic fixture rendered by `capture/source-render-todomvc.ts` and parameterized by nominal app label — not screenshots captured from the eight live web applications named in the pre-registration. The per-app labels carried through the manifest (Conduit, Mattermost, Excalidraw, GitLab CE, Rocket.Chat, Penpot, Cal.com, NocoDB) are nominal: they identify the parameter set used to render each subset of the synthetic corpus, not the application from which the screenshot was captured. The pre-registered RQ1 — whether the antecedent's κ = 0.667 generalizes across real applications — is therefore *out of scope for Phase 1 by design.* Phase 1 results should not be cited as evidence about cross-application generalization. Phase 1 results should be cited as evidence about the harness infrastructure's end-to-end operability and as a methodological pilot whose findings inform the design of the (pre-registered, deferred) Phase 2 experiment.

*Defect-category coverage.* The six categories enumerated in §6.3 of the Results are not an exhaustive partition of all possible visual regressions. Animation defects, dynamic-content defects, interaction-state defects, and accessibility regressions outside the contrast subset are not covered. The pre-registration explicitly bounded the taxonomy to the six injection primitives, and we do not claim coverage beyond them.

*Modality.* This study evaluates web visual-regression only. Mobile-application regression, hardware-in-the-loop visual assertion, and cross-device rendering are out of scope. The author's antecedent agent-harness work (Malhotra 2026, JSS submission pending) covers a cross-layer harness; this paper restricts itself to web for tractability of the per-application capture protocol.

*Judge coverage.* Phase 1 evaluates three judges: Claude OAuth (frontier proprietary, subscription path), OpenAI Codex (frontier proprietary, subscription path), and Llama 3.2 Vision 11B (open-weights local). The pre-registered Phase 2 design adds Gemini 2.5 Pro as a fourth judge; that judge is deferred to Phase 2 because the free-tier API access path was not exercised in Phase 1's subscription-path dispatch. Conclusions about open-weights vision generalize from a single 11B-parameter model and should not be extended to larger open-weights models without separate evaluation.

## 6.3 Construct validity

*Cohen's κ as the agreement metric.* Cohen's κ (Cohen 1960) is known to behave poorly on highly skewed marginal distributions — the so-called κ paradox documented by Cicchetti & Feinstein (1990). The Llama-pair κ values of 0.000 are a direct instance of this paradox: when one rater emits an invariant verdict, the marginal is fully skewed and κ collapses to zero regardless of the other rater's distribution. We mitigate by reporting bootstrap 95% confidence intervals (1,000 resamples, seed 42, percentile method) alongside every κ point estimate, by reporting Fleiss' κ (Fleiss 1971) across all three judges in addition to pairwise Cohen's κ, and by interpreting the Llama-degenerate κ values as substantive findings about the Llama verdict distribution rather than as numerical curiosities.

*By-construction ground truth as a simplification.* Phase 1's by-construction ground truth — every pair is a defect pair, so the expected verdict is always `fail` — is a deliberate simplification. Real-world visual regressions need not always present as the clear-cut programmatic differences our injection primitives produce; many production defects are subtle, partial, or context-dependent in ways the seeded primitives do not capture. Phase 2's protocol replaces by-construction ground truth with human-coded ground truth on live-application screenshots, with the 80-pair double-coded subsample addressing the coder-reliability dimension.

*Binary verdict operationalization.* "Defect detection" is operationalized in this paper as a binary {`fail`, `pass`} verdict per image pair. This is a simplification of what real visual-regression review involves (severity grading, defect localization, false-positive subtype). We mitigate by reporting per-category accuracy separately (§6.3 of Results) to surface category-specific patterns that a single binary metric would obscure.

## 6.4 Conclusion validity

*Wide bootstrap CIs on per-category cells.* Per-category sample sizes range from 64 to 72 pairs, which yields per-category recall point estimates whose bootstrap CIs are wider than the corpus-level CI. We report the CIs honestly rather than suppressing the uncertainty.

*Multiple-comparison adjustment.* Phase 1 reports three pairwise κ values without multiple-comparison adjustment. All three pairs are pre-specified (the pre-registration enumerates the judge set), so this is not exploratory multiple testing. Phase 2's protocol includes multiple-comparison adjustment for the pairwise McNemar's tests where the comparison set is larger.

*Mixed-effects modeling deferred to Phase 2.* The pre-registered mixed-effects logistic regression with app-level and category-level random intercepts (pre-registration §5.1.2) is not estimated in Phase 1, because Phase 1 has no inferential test that requires the random-effects machinery. The model is reserved for the Phase 2 live-application data where the app-level random intercept carries real interpretive weight.

---

# 7. Conclusion and Future Work

Phase 1 of Visual Oracle Bench establishes the reusable methodological infrastructure for multi-application LLM-as-Judge visual-regression evaluation: a pre-registered defect taxonomy with six categories, a deterministic injection harness, a capture orchestrator, a multi-judge dispatcher with retry and parquet result schema, a bootstrap-CI analysis pipeline, and three pre-registered LLM judges accessible via two subscription paths and one local open-weights path. The infrastructure is operational end-to-end at 1,200-judgment scale, with a reproduction-from-fresh-clone script that runs in approximately 10 minutes on a cold machine.

The headline numbers from the Phase 1 synthetic-HTML pilot are: Claude Sonnet 4.5 (via OAuth) at 88.8% recall on the 400-pair corpus, OpenAI gpt-5-codex (via Codex CLI) at 88.2% recall, and Llama 3.2 Vision 11B (via local Ollama) at 0.0% recall. Pairwise Cohen's κ between the two frontier judges is 0.361 (95% CI [0.219, 0.499]; *fair* under Landis & Koch 1977), substantially below the antecedent agent-harness paper's intra-judge κ = 0.667 on a 24-image TodoMVC corpus. Fleiss' κ across all three judges is -0.309 (95% CI [-0.350, -0.265]) — a negative value driven by Llama's invariant `pass` verdict and indicative of systematic disagreement rather than chance-level agreement (Fleiss 1971). Per-category breakdown surfaces non-uniform defect difficulty: both frontier judges achieve perfect recall on `missing` and `truncation` defects, while `layout` and `zorder` produce 13-37% miss rates, with the Codex-versus-Claude split on z-order (62.5% versus 87.5%) the largest per-category divergence between the frontier judges.

The Llama-vision integration finding is contributed as a methodological observation to the LLM-eval community: open-weights vision at the 11B-parameter scale, combined with a side-by-side composite workaround for the model's single-image limitation, did not function as a frontier-judge substitute in this protocol. Whether the 0.0% recall reflects a true capability gap or an artifact of the composite-format workaround cannot be decided within Phase 1; the controlled disentanglement is queued as a Phase 2 sub-study. Pre-registration ([OSF DOI 10.17605/OSF.IO/NKD6J](https://osf.io/nkd6j/), registered 2026-06-06) predates the first LLM judgment dispatch, and the Phase 1 / Phase 2 reporting split preserves the integrity of the registered design.

Three follow-on studies emerge directly from Phase 1.

*(a) The pre-registered Phase 2 live-Docker experiment.* The eight-application live-Docker capture (Conduit, Mattermost, Excalidraw, GitLab CE, Rocket.Chat, Penpot, Cal.com, NocoDB) with all four pre-registered judges (the three Phase 1 judges plus Gemini 2.5 Pro) remains the registered confirmatory study. It is blocked at the time of this submission on Dockerfile debugging across the eight upstream applications (the W2 build-stage code was generated without exercising it; at least two apps have known build-stage bugs). When the infrastructure block clears, RQ1-RQ4 from the pre-registration will be addressed against the registered analysis plan, with mixed-effects logistic regression as the primary confirmatory model and the 80-pair double-coded subsample as the inter-rater reliability anchor.

*(b) The controlled Llama composite-versus-capability sub-study.* The Phase 1 Llama result is interpretable under both a capability-gap explanation and a composite-format-artifact explanation, and Phase 1's uniform application of the composite to every judgment makes the two indistinguishable. The methodological addendum submits each defect pair to Llama twice — once as the side-by-side composite (the Phase 1 protocol) and once as two sequential single-image calls with a text-based comparison reasoning step. Comparing recall between the two input formats isolates the format effect from the capability effect and either supports or constrains the format explanation. This sub-study is small (the same 400 pairs at concurrency 3 in approximately one hour of local Ollama wall clock) and will be reported alongside the Phase 2 main results.

*(c) Human-rater inter-rater on a Phase 2 sub-sample.* The pre-registered 80-pair double-coded subsample with two non-author raters (pre-registration §4.6) anchors the LLM-versus-human comparison registered as RQ4 (whether LLM-LLM κ correlates with LLM-human κ on the same pairs). This anchor is intentionally absent from Phase 1, where by-construction ground truth eliminates the coder-reliability question; in Phase 2 the ground-truth scaffolding is human coding against the codebook with the pre-registered Fleiss' κ ≥ 0.60 reliability floor.

All Phase 1 artifacts ship under MIT (code) and CC-BY 4.0 (data) licenses at the project repository, with a Zenodo DOI to be minted at manuscript submission. The reproduction pipeline is one-shot: a fresh clone plus `./scripts/reproduce_paper.sh` plus the dispatcher invocation plus the analysis script regenerates every number reported in this paper, with the bootstrap seed (42) and the model identifiers (resolved at run time and captured into `results/judgments_metadata.json`) the only run-to-run variables. The pre-registration timestamp, the parquet judgment logs, the analysis output, and the manuscript prose are all version-controlled in the same repository; any number in this paper can be traced to its source row by following the path documented in the artifacts manifest.

---

## References

[Bibliography to be assembled from inline bracketed citations across §1-§7 at final assembly. Citation count: ~25-30 unique sources.]

