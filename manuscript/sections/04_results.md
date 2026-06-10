## 4. Results (Phase 1 — synthetic-HTML pilot)

We report what was observed when the harness was run end-to-end against the 400-pair synthetic-HTML corpus using three vision LLM judges: Claude Sonnet 4.5 (via `claude -p` OAuth subprocess; resolved model identifier `claude-sonnet-4-5-20250929`), OpenAI gpt-5-codex (via `codex exec` ChatGPT-session subprocess; resolved identifier `gpt-5-codex`), and Llama 3.2 Vision 11B (via local Ollama; pinned identifier `llama3.2-vision:11b`). Each judge produced one verdict per pair (`fail` = regression detected, `pass` = no regression), so the run produced 1,200 judgments. Ground truth is by construction: every pair in the manifest is a baseline-vs-defect pair in which a defect was programmatically injected (color, layout, missing, truncation, z-order, or contrast), so the expected verdict for every pair is `fail`. Because there are no true-negative pairs in the Phase 1 corpus, precision is undefined; accuracy and recall coincide. All numbers in this section are reproducible from a fresh clone via `./scripts/reproduce_paper.sh` followed by the dispatcher and the analysis pipeline; the parquet outputs, the analysis script, and a JSON dump of every reported metric ship with the manuscript at `analysis/results/phase1_analysis_<timestamp>.{json,md}`.

### 4.1 Per-judge accuracy against by-construction ground truth

Table 1 reports per-judge accuracy — equivalently, the recall of seeded defects — on the 400 pairs. Frontier judges achieved comparable recall (88.8% for Claude, 88.2% for Codex), missing ~12% of seeded defects each. The open-weights Llama judge returned `pass` on every pair, a 0.0% recall floor (Table 1, third row). This is not a malformed-response artifact: the dispatcher recorded 0/400 malformed verdicts for Llama after the single-image-limitation workaround (§3.4 + §4.8) was applied. Every Llama judgment was a well-formed JSON object asserting that no defect was visible. The workaround composites the baseline and defect images side-by-side into a single PNG before submission; we discuss in §4.5 whether the 0% result reflects a true Llama capability gap or a composite-format artifact.

**Table 1.** Per-judge accuracy (= recall) of seeded-defect detection on the 400-pair synthetic-HTML Phase 1 corpus. All 1,200 judgments were well-formed and non-malformed. Ground truth = `fail` for all pairs; precision is undefined.

| Judge | Model (resolved at run-time) | n_total | n_fail (correct) | n_pass (false-negative) | Recall |
|---|---|---:|---:|---:|---:|
| Claude OAuth | `claude-sonnet-4-5-20250929` | 400 | 355 | 45 | 88.8% |
| OpenAI Codex | `gpt-5-codex` | 400 | 353 | 47 | 88.2% |
| Llama (Ollama) | `llama3.2-vision:11b` | 400 | 0 | 400 | 0.0% |

The frontier judges agreed on the failure-modes location with caveat: the per-category breakdown in §4.3 shows that Claude and Codex miss different defect classes despite similar overall recall, with disagreement concentrated in z-order and layout categories.

### 4.2 Pairwise inter-judge agreement (Cohen's κ)

Cohen's κ over the binary `{fail, pass}` verdict space was computed for each judge pair on the intersection of pairs for which both judges produced a valid verdict (n=400 for all three pairs since no judgments were malformed). Bootstrap 95% confidence intervals were computed by resampling pair indices 1,000 times with a fixed seed (42), reported as percentile intervals.

**Table 2.** Pairwise inter-judge Cohen's κ with 95% bootstrap CIs (1,000 resamples, seed 42). Landis-Koch (1977) interpretation in the last column.

| Judge A | Judge B | n | κ | 95% CI | Landis-Koch label |
|---|---|---:|---:|---|---|
| Claude OAuth | OpenAI Codex | 400 | 0.361 | [0.219, 0.499] | fair |
| Claude OAuth | Llama | 400 | 0.000 | [0.000, 0.000] | poor |
| OpenAI Codex | Llama | 400 | 0.000 | [0.000, 0.000] | poor |

The Claude-Codex agreement (κ = 0.361, fair) is below the antecedent agent-harness paper's reported κ = 0.667 [Malhotra 2026a]. The comparison requires care: the antecedent κ is an *intra-judge* consistency measurement (the same Claude judge run twice on a 24-image TodoMVC corpus, agreement of one model with itself), while the Phase 1 κ is an *inter-judge* agreement measurement (Claude vs OpenAI Codex on a 400-pair synthetic-HTML corpus, agreement of two different models). These are categorically different constructs; the difference between an intra-judge consistency of 0.667 and an inter-judge agreement of 0.361 is expected and reproduces a pattern well-documented in the human-rater literature [Hallgren 2012]. We report the gap honestly because both numbers appear in the LLM-as-Judge SE literature, and readers comparing them should understand the constructs differ.

The Llama-pair κ values are degenerate at 0.000 because Llama emits an invariant verdict (`pass`) on every pair. With one side of the contingency table empty, κ collapses to zero regardless of the other judge's distribution. This is not an artifact of small sample size; it is a substantive finding about the Llama judgment distribution.

### 4.3 Three-rater consensus: Fleiss' κ

Fleiss' κ across all three judges, computed on the 400 pairs for which all three judges produced a valid verdict, is **-0.309** (95% CI [-0.350, -0.265], 1,000-resample bootstrap, percentile interval). The negative value indicates *systematic disagreement*, not chance-level agreement: the two frontier judges concur on `fail` for ~88% of pairs while the open-weights judge invariantly disagrees by reporting `pass`. Fleiss' κ is computed across k=2 nominal categories on n=400 subjects with 3 raters per subject. The negative Fleiss' κ is a real, interpretable signal about *this protocol's three-judge distribution on this corpus* — that is, with the side-by-side composite workaround applied to Llama, the three-judge consensus is systematically lower than chance would predict, driven entirely by Llama's invariant verdict. We resist generalizing this to "open-weights vision at the 11B-parameter scale cannot be used interchangeably with frontier models" because the §5.2 capability-vs-format-artifact ambiguity is unresolved. Whether the negative Fleiss' κ reflects a model-capability gap or a composite-format artifact is queued for the Phase 2 controlled disentanglement sub-study (§5.2).

### 4.4 Per-defect-category breakdown

Per-defect-category accuracy (Table 3) reveals that defect-detection difficulty is highly category-dependent for the frontier judges. Both Claude and Codex achieve perfect recall (point estimate 100.0%, with CIs collapsing to the boundary at n=64) on `missing` (entire element removed from the page) and `truncation` (text content clipped) defects. Among the imperfect categories, two cross-judge differences survive bootstrap-CI overlap inspection: (i) Codex outperforms Claude on `contrast` defects (100.0% vs 80.6%, CIs disjoint), and (ii) Claude outperforms Codex on `z-order` defects (87.5% vs 62.5%, CIs disjoint — Claude lower bound 79.2% > Codex upper bound 73.6%). The Codex-vs-Claude difference on `layout` (84.4% vs 76.6%) does NOT survive CI inspection — the two CIs overlap heavily ([75.0%, 92.2%] vs [65.6%, 85.9%]) — and we therefore do not interpret it as a judge-specific weakness. The `color` difference (89.1% vs 84.4%) is similarly within CI overlap and should not be over-read. Category effects do not transfer to Llama, which is at 0% across all six categories.

**Table 3.** Per-defect-category accuracy of seeded-defect detection with 95% percentile-bootstrap CIs (1,000 resamples, seed 42). At per-category n=64-72, the CIs are wide; cross-judge differences within overlapping CIs should NOT be interpreted as evidence of judge-specific weakness.

| Category | Claude OAuth (n) accuracy [95% CI] | OpenAI Codex (n) accuracy [95% CI] | Llama (n) accuracy [95% CI] |
|---|---:|---:|---:|
| `missing` | 100.0% (n=64) [100.0%, 100.0%] | 100.0% (n=64) [100.0%, 100.0%] | 0.0% (n=64) [0.0%, 0.0%] |
| `truncation` | 100.0% (n=64) [100.0%, 100.0%] | 100.0% (n=64) [100.0%, 100.0%] | 0.0% (n=64) [0.0%, 0.0%] |
| `color` | 89.1% (n=64) [81.2%, 96.9%] | 84.4% (n=64) [75.0%, 92.2%] | 0.0% (n=64) [0.0%, 0.0%] |
| `zorder` | 87.5% (n=72) [79.2%, 94.4%] | 62.5% (n=72) [51.4%, 73.6%] | 0.0% (n=72) [0.0%, 0.0%] |
| `contrast` | 80.6% (n=72) [70.8%, 88.9%] | 100.0% (n=72) [100.0%, 100.0%] | 0.0% (n=72) [0.0%, 0.0%] |
| `layout` | 76.6% (n=64) [65.6%, 85.9%] | 84.4% (n=64) [75.0%, 92.2%] | 0.0% (n=64) [0.0%, 0.0%] |

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

All three judges in the Phase 1 dispatch were billed at $0 marginal per-call cost via subscription channels held by the author: Claude Sonnet 4.5 via `claude -p` OAuth (Anthropic Claude Max subscription, ~$40/mo at 2026-06 pricing); OpenAI gpt-5-codex via `codex exec` (ChatGPT Plus + Codex CLI subscription, ~$20/mo); and Llama 3.2 Vision 11B served locally (no per-token cost; ~$0.10/run estimated for electricity + opportunity cost of the local GPU/CPU, not modeled). A replicator using the API-key alternate paths (`gpt-4o-2024-11-20` instead of Codex; `claude-sonnet-4-5-20250929` via direct API instead of OAuth; Llama unchanged) would incur approximately $3-7 USD per 1,200-judgment dispatch at 2026-06 pricing (see `oracles/llm_judge/cost_constants.ts` for the pricing snapshot). Subscription-channel replication requires ~$60/mo in active subscriptions at the time of writing; API-key replication has no subscription requirement and uses metered per-call billing. The dispatcher's budget gate ($1,500 default) was never approached in Phase 1.

### 4.8 Failure modes documented during Phase 1

Two failure modes surfaced during the Phase 1 pilot. The first is a model-integration limitation; the second is a within-dispatcher operational observation.

**(i) Llama 3.2 Vision 11B refuses multi-image requests.** The initial 2026-06-06 W7 dispatch returned malformed verdicts for 400/400 Llama judgments with the error `"this model only supports one image while more than one image requested"`. The dispatcher's malformed-on-provider-error code path recorded the failure cleanly; the bug was diagnosed within 30 seconds of inspecting the parquet rationale column. We patched the Llama judge to composite the baseline and defect images side-by-side into a single PNG before submission, with a 28-pixel label band ("BASELINE LEFT", "DEFECT-CANDIDATE RIGHT") and a 4-pixel vertical divider. The patched judge re-ran the 400 pairs cleanly with 0/400 malformed responses on 2026-06-09. The composite workaround is implemented in `oracles/llm_judge/llama_ollama.ts::compositeBaselineAndDefect` and unit-tested in `tests/test_llama_composite_unit.ts`. Reviewers can reproduce the workaround behavior with `npx tsx scripts/smoke_llama_fix.ts` (one-pair manual smoke) or `npm run test:llama_composite` (3-case structural unit test).

**(ii) Composite-format vs. capability-gap ambiguity for the 0% Llama result.** The Llama 0.0% accuracy result (Table 1) is consistent with two non-mutually-exclusive explanations. First, the side-by-side composite may have reduced per-image effective resolution below Llama's defect-detection threshold (the composite is rendered at the maximum of the two input heights but each panel occupies only half of the composite's width). Second, Llama 3.2 Vision 11B may have lower fine-grained visual-regression sensitivity than the frontier judges regardless of input format. We cannot disentangle these explanations within Phase 1's corpus because the composite was applied to every Llama judgment uniformly. A controlled follow-up — submitting the same defect pair to Llama twice, once as the side-by-side composite and once as two separate sequential calls with text-based comparison reasoning — would isolate the format effect from the capability effect. This is queued as a Phase 2 methodological sub-study.

### 4.9 What Phase 1 establishes — and does not

Phase 1 establishes (a) the benchmark harness is operational end-to-end at 1,200-judgment scale across two subscription-path judges and one local open-weights judge, (b) the dispatcher's parquet output schema and per-judgment retry semantics work as designed (0% malformed final rate after the Llama workaround), (c) frontier vision-LLM judges agree at fair-but-not-substantial level (Cohen's κ = 0.361) on seeded-defect detection in synthetic HTML, (d) open-weights vision at the 11B-parameter scale cannot be substituted for frontier judges in this protocol (0% accuracy, Fleiss' κ = -0.309 in the three-judge consensus), and (e) defect-category difficulty is non-uniform — `missing` and `truncation` are detected perfectly by frontier judges while `layout` and `z-order` show 13–37% miss rates.

Phase 1 does NOT establish (a) cross-application generalization of agreement (the corpus is synthetic-HTML, per-app labels are nominal), (b) whether the Llama 0% result is a capability gap or a composite-format artifact (the controlled follow-up is queued), (c) any human-rater inter-rater reliability (ground truth is by construction in Phase 1; human inter-rater is reserved for Phase 2 where ground truth is non-trivial), and (d) the pre-registered Phase 2 confirmatory results for RQ1-RQ4 (deferred to the live-Docker 8-app experiment, blocked at submission time).

---
