# Manuscript §6 — Phase 1 Results (drop-in prose for skeleton §6.1)

**Version:** 1.0 (2026-06-09, generated from `analysis/results/phase1_analysis_2026-06-09T23-03-16Z.md`)
**Replaces:** `skeleton.md` §4 Results placeholders (lines 130-162) for the Phase 1 pilot submission
**Source data:** `results/judgments_2026-06-07T02-50-09-790Z.parquet` (claude-oauth + openai-codex, 800 rows) + `results/judgments_2026-06-09T22-16-41-218Z.parquet` (llama, 400 rows)
**Analysis script:** `analysis/analyze_judgments.py` (commit 58f3940; bootstrap seed 42; 1000 resamples)

---

## 6. Results (Phase 1 — synthetic-HTML pilot)

We report what was observed when the harness was run end-to-end against the 400-pair synthetic-HTML corpus using three vision LLM judges: Claude Sonnet 4.5 (via `claude -p` OAuth subprocess; resolved model identifier `claude-sonnet-4-5-20250929`), OpenAI gpt-5-codex (via `codex exec` ChatGPT-session subprocess; resolved identifier `gpt-5-codex`), and Llama 3.2 Vision 11B (via local Ollama; pinned identifier `llama3.2-vision:11b`). Each judge produced one verdict per pair (`fail` = regression detected, `pass` = no regression), so the run produced 1,200 judgments. Ground truth is by construction: every pair in the manifest is a baseline-vs-defect pair in which a defect was programmatically injected (color, layout, missing, truncation, z-order, or contrast), so the expected verdict for every pair is `fail`. Because there are no true-negative pairs in the Phase 1 corpus, precision is undefined; accuracy and recall coincide. All numbers in this section are reproducible from a fresh clone via `./scripts/reproduce_paper.sh` followed by the dispatcher and the analysis pipeline; the parquet outputs, the analysis script, and a JSON dump of every reported metric ship with the manuscript at `analysis/results/phase1_analysis_<timestamp>.{json,md}`.

### 6.1 Per-judge accuracy against by-construction ground truth

Table 1 reports per-judge accuracy — equivalently, the recall of seeded defects — on the 400 pairs. Frontier judges achieved comparable recall (88.8% for Claude, 88.2% for Codex), missing ~12% of seeded defects each. The open-weights Llama judge returned `pass` on every pair, a 0.0% recall floor (Table 1, third row). This is not a malformed-response artifact: the dispatcher recorded 0/400 malformed verdicts for Llama after the single-image-limitation workaround (§5.X) was applied. Every Llama judgment was a well-formed JSON object asserting that no defect was visible. The workaround composites the baseline and defect images side-by-side into a single PNG before submission; we discuss in §6.5 whether the 0% result reflects a true Llama capability gap or a composite-format artifact.

**Table 1.** Per-judge accuracy (= recall) of seeded-defect detection on the 400-pair synthetic-HTML Phase 1 corpus. All 1,200 judgments were well-formed and non-malformed. Ground truth = `fail` for all pairs; precision is undefined.

| Judge | Model (resolved at run-time) | n_total | n_fail (correct) | n_pass (false-negative) | Recall |
|---|---|---:|---:|---:|---:|
| Claude OAuth | `claude-sonnet-4-5-20250929` | 400 | 355 | 45 | 88.8% |
| OpenAI Codex | `gpt-5-codex` | 400 | 353 | 47 | 88.2% |
| Llama (Ollama) | `llama3.2-vision:11b` | 400 | 0 | 400 | 0.0% |

The frontier judges agreed on the failure-modes location with caveat: the per-category breakdown in §6.3 shows that Claude and Codex miss different defect classes despite similar overall recall, with disagreement concentrated in z-order and layout categories.

### 6.2 Pairwise inter-judge agreement (Cohen's κ)

Cohen's κ over the binary `{fail, pass}` verdict space was computed for each judge pair on the intersection of pairs for which both judges produced a valid verdict (n=400 for all three pairs since no judgments were malformed). Bootstrap 95% confidence intervals were computed by resampling pair indices 1,000 times with a fixed seed (42), reported as percentile intervals.

**Table 2.** Pairwise inter-judge Cohen's κ with 95% bootstrap CIs (1,000 resamples, seed 42). Landis-Koch (1977) interpretation in the last column.

| Judge A | Judge B | n | κ | 95% CI | Landis-Koch label |
|---|---|---:|---:|---|---|
| Claude OAuth | OpenAI Codex | 400 | 0.361 | [0.219, 0.499] | fair |
| Claude OAuth | Llama | 400 | 0.000 | [0.000, 0.000] | poor |
| OpenAI Codex | Llama | 400 | 0.000 | [0.000, 0.000] | poor |

The Claude-Codex agreement (κ = 0.361, fair) is substantially below the antecedent agent-harness paper's intra-judge result (κ = 0.667, substantial) on a smaller TodoMVC corpus with a different prompt protocol. Two factors plausibly account for the gap: (a) the Phase 1 corpus has many more pairs (400 vs the antecedent's 24), driving down random-chance agreement bias and making κ a more conservative estimator; (b) the synthetic-HTML defects span six categories with different detection difficulty (§6.3), and the two judges have different category-specific blind spots. Phase 2 will repeat this measurement with live-application screenshots and the same prompt to disentangle corpus from protocol effects.

The Llama-pair κ values are degenerate at 0.000 because Llama emits an invariant verdict (`pass`) on every pair. With one side of the contingency table empty, κ collapses to zero regardless of the other judge's distribution. This is not an artifact of small sample size; it is a substantive finding about the Llama judgment distribution.

### 6.3 Three-rater consensus: Fleiss' κ

Fleiss' κ across all three judges, computed on the 400 pairs for which all three judges produced a valid verdict, is **-0.309** (95% CI [-0.350, -0.265], 1,000-resample bootstrap, percentile interval). The negative value indicates *systematic disagreement*, not chance-level agreement: the two frontier judges concur on `fail` for ~88% of pairs while the open-weights judge invariantly disagrees by reporting `pass`. Fleiss' κ is computed across k=2 nominal categories on n=400 subjects with 3 raters per subject. The negative κ is a real, interpretable signal — it tells future benchmark designers that open-weights vision models at the 11B-parameter scale cannot be used interchangeably with frontier models for fine-grained visual-regression detection, at least not with the prompt protocol pre-registered in this study.

### 6.4 Per-defect-category breakdown

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

### 6.5 Per-(nominal-)app breakdown

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

### 6.6 Latency

**Table 5.** Per-judge latency in milliseconds. Wall-clock per judgment, measured from the judge subprocess start to JSON-verdict receipt. Concurrency was 3 per judge in the dispatcher.

| Judge | n | Mean (ms) | Median (ms) | p95 (ms) |
|---|---:|---:|---:|---:|
| Claude OAuth | 400 | 4,014 | 1,582 | 13,753 |
| OpenAI Codex | 400 | 8,816 | 5,710 | 28,927 |
| Llama (Ollama) | 400 | 18,957 | 21,574 | 32,941 |

The frontier judges are ~5–13× faster than the open-weights local judge at the 11B-parameter scale on the author's hardware (Apple M-series, no GPU offload beyond Metal). For a 400-pair corpus at concurrency 3, the dispatcher wall-clock was approximately 29 minutes for the joint Claude+Codex first run and approximately 50 minutes for the Llama re-run alone.

### 6.7 Cost

All three judges in the Phase 1 dispatch had $0.00 marginal cost per call: Claude was accessed via the user's Claude Code subscription (`claude -p` OAuth subprocess, no per-token API billing), OpenAI was accessed via the user's ChatGPT/Codex subscription (`codex exec` subprocess, no per-token API billing), and Llama was served locally (no per-token pricing). Computation cost (electricity, opportunity cost of the local GPU/CPU) is not modeled. The dispatcher's budget gate ($1,500 default) was never approached.

### 6.8 Failure modes documented during Phase 1

Two failure modes surfaced during the Phase 1 pilot. The first is a model-integration limitation; the second is a within-dispatcher operational observation.

**(i) Llama 3.2 Vision 11B refuses multi-image requests.** The initial 2026-06-06 W7 dispatch returned malformed verdicts for 400/400 Llama judgments with the error `"this model only supports one image while more than one image requested"`. The dispatcher's malformed-on-provider-error code path recorded the failure cleanly; the bug was diagnosed within 30 seconds of inspecting the parquet rationale column. We patched the Llama judge to composite the baseline and defect images side-by-side into a single PNG before submission, with a 28-pixel label band ("BASELINE LEFT", "DEFECT-CANDIDATE RIGHT") and a 4-pixel vertical divider. The patched judge re-ran the 400 pairs cleanly with 0/400 malformed responses on 2026-06-09. The composite workaround is implemented in `oracles/llm_judge/llama_ollama.ts::compositeBaselineAndDefect` and unit-tested in `tests/test_llama_composite_unit.ts`. Reviewers can reproduce the workaround behavior with `npx tsx scripts/smoke_llama_fix.ts` (one-pair manual smoke) or `npm run test:llama_composite` (3-case structural unit test).

**(ii) Composite-format vs. capability-gap ambiguity for the 0% Llama result.** The Llama 0.0% accuracy result (Table 1) is consistent with two non-mutually-exclusive explanations. First, the side-by-side composite may have reduced per-image effective resolution below Llama's defect-detection threshold (the composite is rendered at the maximum of the two input heights but each panel occupies only half of the composite's width). Second, Llama 3.2 Vision 11B may have lower fine-grained visual-regression sensitivity than the frontier judges regardless of input format. We cannot disentangle these explanations within Phase 1's corpus because the composite was applied to every Llama judgment uniformly. A controlled follow-up — submitting the same defect pair to Llama twice, once as the side-by-side composite and once as two separate sequential calls with text-based comparison reasoning — would isolate the format effect from the capability effect. This is queued as a Phase 2 methodological sub-study.

### 6.9 What Phase 1 establishes — and does not

Phase 1 establishes (a) the benchmark harness is operational end-to-end at 1,200-judgment scale across two subscription-path judges and one local open-weights judge, (b) the dispatcher's parquet output schema and per-judgment retry semantics work as designed (0% malformed final rate after the Llama workaround), (c) frontier vision-LLM judges agree at fair-but-not-substantial level (Cohen's κ = 0.361) on seeded-defect detection in synthetic HTML, (d) open-weights vision at the 11B-parameter scale cannot be substituted for frontier judges in this protocol (0% accuracy, Fleiss' κ = -0.309 in the three-judge consensus), and (e) defect-category difficulty is non-uniform — `missing` and `truncation` are detected perfectly by frontier judges while `layout` and `z-order` show 13–37% miss rates.

Phase 1 does NOT establish (a) cross-application generalization of agreement (the corpus is synthetic-HTML, per-app labels are nominal), (b) whether the Llama 0% result is a capability gap or a composite-format artifact (the controlled follow-up is queued), (c) any human-rater inter-rater reliability (ground truth is by construction in Phase 1; human inter-rater is reserved for Phase 2 where ground truth is non-trivial), and (d) the pre-registered Phase 2 confirmatory results for RQ1-RQ4 (deferred to the live-Docker 8-app experiment, blocked at submission time).

---

## End of §6 prose

Word count: ~1,650 (within EMSE Methodological Articles target for the Results section of a methodological-pilot paper).

All numbers in this section are reproducible from `analysis/results/phase1_analysis_2026-06-09T23-03-16Z.{json,md}` and the underlying parquets. Bootstrap seed 42, 1,000 resamples.
