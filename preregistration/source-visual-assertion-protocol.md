# Visual-Assertion Human Spot-Audit Protocol

**Article 2 (Agent Harness) — §6.1 reflexive-correctness mitigation.**

## Purpose

The §6 visual-assertion service emits per-image PASS/FAIL verdicts on a 24-image corpus (`VISUAL_CORPUS` in `harness.ts`: 12 functional defects + 12 cosmetic variations). The verdicts are produced by the same model that authored the underlying test cases, and the precision/recall numbers in `results.json` are therefore *model-reported, not human-validated*. This protocol bounds the same-model self-evaluation bias risk by validating the LLM-judge verdicts against two independent human raters. The Cohen's κ numbers it produces are required before the §6 visual-assertion precision/recall can be cited as validation-scale evidence (per §6.1 of the manuscript).

## Corpus

24 images from `VISUAL_CORPUS` in `harness.ts`:

- `vis-func-1` through `vis-func-12` — 12 functional defects (e.g., primary CTA obscured, content clipped, accessibility-minimum violated). Ground-truth label: a competent QA should flag these as FAIL.
- `vis-cosm-1` through `vis-cosm-12` — 12 cosmetic variations (font, spacing, colour drift, layout-preserving repaint). Ground-truth label: a competent QA should mark these PASS (the visual-assertion service is supposed to ignore cosmetic-only differences and surface only functional ones).

Ground-truth labels are assigned at corpus-design time by the author and sealed in `packet/visual-assertion/test_cases_KEY.csv` (built by the audit coordinator from the `seeded` field on each `VISUAL_CORPUS` entry); they are not shown to raters during scoring.

## Sample size

**Full corpus, N = 24.** Unlike the spec-enrichment audit in `spec-enrichment-reference/` (which samples 20% of a larger pool), the visual-assertion corpus is small enough that every image is rated. No sampling step.

## Raters

Two raters required. **Neither rater is the author.** Preferred profile: senior QA engineer or test architect with ≥5 years of UI test-review experience, no prior exposure to the article draft.

## Blinding procedure

1. The rater receives the 24 images in a shuffled order (deterministic shuffle, fixed RNG seed `numpy.random.default_rng(2026)` so both raters see the same shuffle) with the `vis-func-*` / `vis-cosm-*` source IDs stripped and replaced with neutral `TC01`…`TC24` labels.
2. Alongside each image, the rater receives: (a) the `expected` behavior text from the corresponding `VISUAL_CORPUS` entry; (b) the `properties` checklist for that entry.
3. The rater is **not** shown: which images are functional vs. cosmetic, the LLM-judge verdict, or any commentary about the article's hypothesis.
4. The rater outputs a verdict per image: `PASS` (the rendered screen matches the expected behavior and all checklist properties hold) or `FAIL` (one or more properties violated, or the rendered screen does not match the expected behavior). A free-text `reason` field captures the one-line justification.
5. The two raters do not communicate during the rating pass.

## Rubric

The rubric is binary and intentionally close to what the LLM-judge does internally so the verdicts are directly comparable:

| Verdict | Plain-English definition |
|---|---|
| **PASS** | All checklist properties hold and the rendered screen matches the expected-behavior description. Cosmetic differences (font, spacing, colour drift) that do not violate a checklist property are not grounds for FAIL. |
| **FAIL** | At least one checklist property is violated (e.g., CTA obscured, content clipped, accessibility minimum not met) **or** the rendered screen does not match the expected-behavior description in a functionally observable way. |

Plain-English guidance, in priority order:

1. **Properties before prose.** The checklist is authoritative. If every property holds, the verdict is PASS even when the prose description is loosely worded.
2. **Functional over cosmetic.** Ignore font, kerning, anti-aliasing, palette drift, exact pixel positions. Flag obscured controls, clipped content, illegible text, missing affordances.
3. **No charity for design.** A property violation is a FAIL even if the violation looks intentional.

## Inter-rater reliability metric

**Cohen's κ** computed on the two raters' verdicts treated as a binary categorical variable over {PASS, FAIL}. Computed by `packet/visual-assertion/analysis.py`.

Interpretation thresholds (Landis & Koch 1977):

- κ < 0.20 — poor; the LLM-judge precision/recall numbers in §6 are not reliable; abort the cited claims.
- 0.20 ≤ κ < 0.40 — fair; report the disagreement and treat §6 visual-assertion numbers as bounded estimates with explicit uncertainty.
- 0.40 ≤ κ < 0.60 — moderate; acceptable for a Practice column claim with an explicit κ disclosure.
- 0.60 ≤ κ < 0.80 — substantial; §6 visual-assertion numbers can be cited as validation-scale evidence.
- κ ≥ 0.80 — almost perfect; §6 visual-assertion numbers are robust.

## Comparison against the LLM-as-judge

For each of the 24 images, compare the human-aggregated verdict (majority vote across the two raters; on a 1-1 tie, defer to the more conservative verdict — FAIL) to the LLM-judge verdict already recorded in `results.json` under `visualAssertion.events[].verdict`. The analysis script reports:

1. **Raw agreement rate** between each rater and the LLM-judge (R1-vs-LLM, R2-vs-LLM).
2. **Cohen's κ** between the human-aggregated verdict and the LLM-judge verdict.
3. **Confusion matrix** (2×2): human verdict × LLM verdict.
4. **Per-class breakdown**: precision and recall of the LLM-judge against the human-aggregated verdicts, separately on the functional and cosmetic subsets, against the seeded ground truth in the KEY file.

A binarization note: the `AssertionEvent.passed` field in `results.json` is already binary. No further binarization is needed; the analysis script reads `passed` directly.

## Output

A markdown document at `audit/visual-assertion-results_YYYY-MM-DD.md` containing:

1. Date, rater identifiers (initials suffice), rating duration per rater.
2. The 24 image IDs with each rater's verdict and reason.
3. Inter-rater κ (R1 vs R2).
4. Per-rater raw agreement with the LLM-judge.
5. Human-aggregated-vs-LLM κ.
6. The 2×2 confusion matrix.
7. Per-class precision/recall (functional vs. cosmetic subsets) of the LLM-judge against the human-aggregated verdicts.
8. Recommendation on whether the §6 visual-assertion precision/recall numbers should be cited as validation-scale evidence.

## Reproducibility

To regenerate the LLM-judge verdicts the human raters will check against:

```bash
cd agent-harness
npm install
npx tsx harness.ts --provider anthropic   # writes results.json with visualAssertion.events
```

Then build the blinded rater packet from `harness.ts` + `results.json` using the helper steps in `packet/visual-assertion/README_FOR_RATERS.md` and email the packet plus a copy of `packet/visual-assertion/rater_template.csv` to each rater.
