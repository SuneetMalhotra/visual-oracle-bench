# Manuscript Skeleton — Article 3 (Visual Oracle Bench)

**This is NOT the manuscript.** This is a section-level outline with bullet placeholders for what each section WILL contain. The actual prose is written by the author in W13-W14 (Aug 31 - Sep 13, 2026) AFTER the W1-W12 empirical work is complete. Per the no-AI-in-manuscript rule (Eldh, extended to all peer-reviewed venues including EMSE), every sentence of the manuscript prose must be authored by Suneet Malhotra directly.

This skeleton exists to:
1. Lock the structural plan early so writing in W13-W14 is faster
2. Force pre-W12 thinking about what each section needs (so the analysis serves the manuscript, not the other way around)
3. Surface gaps in the empirical plan (if a section has no clear bullet plan, the analysis plan is probably missing something)

**Pre-registration:** [OSF DOI 10.17605/OSF.IO/NKD6J](https://osf.io/nkd6j/) — registered 2026-06-06, BEFORE any LLM judgments were collected. Methodology section MUST cite this DOI; reviewers will check the registration timestamp against the W7 first-judgment date.

**Target venue:** Empirical Software Engineering (EMSE, Springer)
**Article type:** Research Article (NOT Applied Research Report — Article 2 took that slot at JSS)
**Length target:** 8,000-10,000 words (EMSE Research Articles run longer than IEEE Software magazine pieces)
**LaTeX class:** Springer SVJour3 (already in author's tooling)

---

## TITLE (locked)

*Beyond TodoMVC: A Multi-Application Empirical Evaluation of LLM-as-Judge Visual Regression Detection Across 8 Open-Source Web Applications*

Title locked in W1 OSF pre-registration; do NOT change post-W2 without amendment.

---

## AUTHORS

- Suneet Malhotra (sole author)
- ORCID 0009-0003-8707-9590
- Affiliation: Motorola Solutions (independent research; affiliation for identification only)
- Corresponding: suneetmalhotra2002@gmail.com

---

## ABSTRACT (~250-300 words; W14 final draft)

What each abstract sentence should cover (one bullet = one sentence target):
- Motivation: visual-assertion oracles are a 2024-2026 LLM-as-judge growth area for SE testing; antecedent work reports κ=0.667 on TodoMVC but external validity is unknown
- Method: 8 OSS web apps × 50 seeded defects × 6 categories = 800 image pairs; 4 LLMs (GPT-4o, Claude Sonnet 4.5, Gemini 2.5 Pro, Llama 3.2 Vision) × 3 oracle classes (pixel SSIM, pHash, LLM-as-judge)
- Ground truth: sole-author coding of 800 + 2-rater inter-rater on 80-pair subsample
- Headline finding 1: [TBD W10 — mean per-app κ across 8 apps; comparison to TodoMVC baseline 0.667]
- Headline finding 2: [TBD W10 — mixed-effects regression result; which random effect dominates]
- Headline finding 3: [TBD W10 — LLM-LLM κ vs LLM-human κ correlation; replication of negative finding from antecedent]
- Implication: practitioners can deploy LLM-as-judge oracles only after per-app calibration; cross-app generalization is bounded
- Artifact: open-source benchmark + reproducibility package + Zenodo-archived corpus

NOTE: Numbers in headline findings unknown until W10. Abstract drafted W14 after results frozen.

---

## 1. INTRODUCTION (~1,500 words)

- The visual-assertion problem in modern web GUI testing
- Why LLM-as-judge oracles emerged as 2024-2026 industry practice (production drivers: speed, semantic checks pixel-diff misses)
- The external-validity gap in the existing literature: most published evaluations are single-application or small-corpus (cite Article 2's own κ=0.667 acknowledgment, He et al. 2025 LLM-as-Judge survey, BEWT 2026)
- The four research questions of this paper (one paragraph per RQ, summarized from pre-registration)
- Three contributions of this paper:
  - (1) the multi-application benchmark itself (8 apps, 800 image pairs, public)
  - (2) the empirical answer to RQ1 (does κ generalize)
  - (3) the methodological contribution (random-effects design for cross-app generalization in LLM-as-judge SE evaluation)
- Paper structure roadmap

---

## 2. RELATED WORK (~1,000 words)

Three sub-sections:

### 2.1 LLM-as-Judge for software engineering evaluation
- He et al. 2025 SLR (the foundational survey)
- Single-application studies (BEWT, antecedent agent-harness)
- The gap: cross-app generalization

### 2.2 Visual regression testing oracles
- Pixel-diff baselines (history, limits)
- Perceptual hash family
- Snapshot testing tradeoffs

### 2.3 External validity in empirical SE
- Why multi-system studies matter (cite Wohlin et al., Sjøberg et al.)
- Random-effects models in SE (Briand, Bird, Murphy precedents)

---

## 3. METHODOLOGY (~2,000 words — the longest section)

Five sub-sections, mirroring the OSF pre-registration:

### 3.1 Research questions and hypotheses
- Restate the 4 RQs + 4 directional hypotheses from pre-reg
- Cite the OSF DOI (added W2 after pre-reg goes live)

### 3.2 Application corpus
- 8 apps with rationale for each (diversity dimensions: class × framework × rendering paradigm)
- Substitution rule (pre-registered: drop NocoDB, Penpot if W5 slips)
- Docker setup approach (pinned digests, seed scripts, RUNBOOK convention)

### 3.3 Defect taxonomy and injection
- Table 1 (locked in pre-reg): the 6 categories with operational definitions, mutation primitives, diff signatures, inter-coder κ targets
- 50/app × 8 = 400 defects + 400 baselines = 800 image pairs
- Capture protocol: dual viewport (1440×900 + 375×667), Playwright, network-idle waits

### 3.4 Oracles
- O1 pixel SSIM (threshold calibrated on held-out 80-pair set)
- O2 perceptual hash dHash (threshold calibrated same)
- O3 LLM-as-judge (prompt verbatim in repo, 4 LLMs)

### 3.5 Ground truth and inter-rater reliability
- Sole-author coding of 800 + 2 colleagues on 80-pair subsample
- Codebook + calibration round
- Disagreement-resolution protocol
- Fleiss' κ reported

### 3.6 Analysis plan
- Mixed-effects logistic regression with app + defect-category random intercepts
- McNemar's pairwise
- Cohen's κ with BCa bootstrap CIs
- Sensitivity analyses (pre-registered, not exploratory): held-out viewport, alternative SSIM threshold, rater-disagreement-excluded subset

---

## 4. RESULTS (~1,500 words)

W10-W11 deliverable. Skeleton placeholders only:

### 4.1 Descriptive: per-app, per-LLM, per-defect-category accuracy
- Table 2: 4 LLMs × 8 apps matrix of Cohen's κ (with bootstrap CIs)
- Figure 1: forest plot of per-app κ across 4 LLMs
- Comparison line: TodoMVC κ=0.667 (antecedent)

### 4.2 Confirmatory: mixed-effects regression (H1, H2)
- Table 3: lme4 glmer output (fixed effects = LLM identity; random effects = app + defect-category)
- Random-intercept variance components: which dominates?
- Convergence diagnostics

### 4.3 Confirmatory: McNemar's pairwise (H3)
- Table 4: oracle-pair comparisons (LLM vs pixel; LLM vs pHash; pairwise LLMs)
- Effect sizes

### 4.4 Confirmatory: LLM-LLM κ vs LLM-human κ (H4)
- Table 5: pairwise LLM-LLM Cohen's κ matrix
- Spearman correlation of LLM-LLM κ vs LLM-human κ on 80-pair subsample
- Replication of antecedent negative finding

### 4.5 Sensitivity analyses
- Held-out viewport result
- Alternative SSIM threshold
- Rater-disagreement-excluded subset

### 4.6 Exploratory analyses (clearly labeled)
- Cost-accuracy Pareto frontier across LLMs
- Image-level difficulty regression
- Provider-stability 30-day re-run

---

## 5. DISCUSSION (~1,500 words)

Five sub-sections:

### 5.1 Does the κ=0.667 baseline generalize?
- Direct interpretation of RQ1 result
- Magnitude and direction of attrition
- What practitioners should infer

### 5.2 Application characteristics that predict accuracy
- Which app-level dimensions drive variance
- Practitioner implications (which apps are good fits for LLM-as-judge, which aren't)

### 5.3 LLM differentiation
- Cost-accuracy tradeoffs
- Pareto-dominance findings (if any)

### 5.4 Methodology contribution
- Random-effects design as a reusable template for SE LLM-as-judge evaluation
- Pre-registration as a methodological commitment

### 5.5 What this means for the antecedent agent-harness claim
- Honest re-assessment of the κ=0.667 number in light of cross-app data
- Updated guidance for practitioners reading the antecedent

---

## 6. THREATS TO VALIDITY (~800 words)

Standard four-axis structure (internal, external, construct, conclusion):

### 6.1 Internal validity
- Seeded defects (not naturally occurring); mitigation: defect taxonomy grounded in observed defect categories from production literature
- Single sole-author coder (with 80-pair double-coded subsample); mitigation: inter-rater κ reported; disagreement-resolution protocol pre-registered
- Self-coding of own-injected defects (author knew defect locations); mitigation: blind random shuffling of image ordering before coding

### 6.2 External validity
- 8 apps is more than antecedent's 1 but still less than population of all web apps
- Web-only (no mobile, no hardware-in-the-loop); mitigation: Article 2 (separate paper) covered cross-modal
- 6 defect categories (not exhaustive); mitigation: pre-registration explicitly bounded the taxonomy

### 6.3 Construct validity
- Cohen's κ as agreement metric: known limitations; mitigation: Krippendorff's α reported alongside
- "Defect detection" operationalized as binary agreement: simplification; mitigation: per-category accuracy reported separately

### 6.4 Conclusion validity
- Mixed-effects model assumptions
- Multiple-comparison adjustment for pairwise tests
- Sample sizes for sub-group analyses

---

## 7. RELATED WORK COMPARISON TABLE (~500 words)

Table 6: side-by-side comparison of this work vs. antecedent agent-harness vs. BEWT vs. relevant He et al. 2025 surveyed studies. Dimensions: applications, samples, oracles, LLMs, statistical depth.

---

## 8. CONCLUSION + FUTURE WORK (~500 words)

- Restate three contributions
- Highlight one practitioner-actionable takeaway
- Identify three open problems this paper raises:
  - Human-rater scale: 80-pair double-coding is the minimum; future work needs larger panels
  - Cross-modal extension: mobile and hardware-in-the-loop benchmarks
  - Adaptive prompt-tuning per app (this paper used fixed prompt)
- Connect to broader agentic-SE research program

---

## ACKNOWLEDGMENTS (~100 words)

- Open-source application maintainers (8 apps)
- Two colleague raters (acknowledged after consent obtained in W9-W11)
- Practitioner community feedback received at any venue between now and submission
- No funding declaration

---

## DATA AND CODE AVAILABILITY (~200 words)

- Repository: github.com/SuneetMalhotra/visual-oracle-bench (release tag v1.0.0 at W16)
- License: MIT (code) + CC-BY 4.0 (data)
- OSF pre-registration: DOI [added W2]
- Zenodo DOI for full corpus: [minted W16 at submission]
- All artifacts under MIT/CC-BY at release tag

---

## DISCLOSURE STATEMENT

- Affiliation: Motorola Solutions (Sr. Manager Test Engineering)
- This research is independent of employer
- No proprietary Motorola data, code, or systems used
- No funding from employer or third party
- No conflicts of interest with EMSE editorial board

---

## REFERENCES (W13-W14, formatted via Zotero / BibTeX)

Estimated 50-60 references. Categories:
- LLM-as-judge for SE: He et al. 2025, BEWT 2026, antecedent agent-harness
- Visual regression testing: Healenium, Applitools (commercial), Percy
- Web GUI testing automation: Stocco (Similo), García (Selenium-LLM), Leotta (Robula+)
- Multi-agent SE pipelines: MetaGPT, ChatDev, AutoDroid, AppAgent
- Empirical SE methodology: Wohlin, Sjøberg, Briand
- Statistical methods: lme4 / Bates et al., Krippendorff's α, McNemar
- Mixed-effects in SE: Bird et al. NSE precedents

---

## END OF SKELETON

**Author writes the actual prose W13-W14. This file is the structural plan; do not paste any of these bullet contents as manuscript text — they are placeholders, not prose.**
