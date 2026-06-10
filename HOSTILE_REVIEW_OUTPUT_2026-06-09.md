# Hostile Pre-Submission Review — `article3_phase1_v1.md`

**Reviewer:** Four-persona hostile-but-fair pre-submission auditor
**Target venue:** EMSE Methodological Articles
**Date:** 2026-06-09
**Manuscript path:** `/Users/suneetmalhotra/work/visual-oracle-bench/manuscript/article3_phase1_v1.md`

---

## FINDING 1: Title disagrees with cover letter and suggested-reviewers list
Severity: BLOCKER
Reviewer persona: EDITORIAL
Location: line 1 (manuscript) vs. cover letter line 3 vs. `_suggested_reviewers.md` line 3
What's wrong: The manuscript is titled *Visual Oracle Bench: A Pre-Registered Methodological Pilot for Multi-Application LLM-as-Judge Visual Regression Detection*. The cover letter and the suggested-reviewers list both name the paper *Beyond TodoMVC: A Multi-Application Empirical Evaluation of LLM-as-Judge Visual Regression Detection Across 8 Open-Source Web Applications* (the OSF/Phase-2 title). Editorial staff will reconcile these by opening the PDF — and the EIC will immediately see that the cover letter is pitching a different paper.
Why EMSE will care: Title mismatch between cover letter and manuscript reads as either careless submission or, worse, late-stage retitling that wasn't propagated. Both are desk-reject signals at Springer journals where a triage editor only opens the cover letter and the first page.
Proposed fix: Rewrite the cover letter title to match the manuscript (`Visual Oracle Bench: A Pre-Registered Methodological Pilot…`). Update `_suggested_reviewers.md` line 3 too. Keep the *Beyond TodoMVC* title for the eventual Phase 2 submission only.

## FINDING 2: Abstract section is empty
Severity: BLOCKER
Reviewer persona: EDITORIAL
Location: §Abstract line 27–29 (between `## Abstract` and `# 1. Introduction`)
What's wrong: Line 27 has `## Abstract`, then two blank lines, then `# 1. Introduction`. There is literally no abstract. The skeleton.md still shows the abstract as bullet placeholders with TBD numbers.
Why EMSE will care: Springer submission portals require an abstract; the EIC's first triage opens with the abstract block. A submission with a missing abstract gets returned unread.
Proposed fix: Write the 250-300 word abstract using the Highlights block (lines 17-24) as the source material. The Highlights already contain all the headline numbers and framing.

## FINDING 3: Reproducibility script does NOT do what the manuscript claims
Severity: BLOCKER
Reviewer persona: REPRODUCIBILITY
Location: §Highlights line 23, §3.6 line 196, §4 opening line 211, §7 line 429, ARTIFACTS.md §3
What's wrong: The manuscript repeatedly claims `./scripts/reproduce_paper.sh` produces "single-command offline reproduction" of all 1,200 judgments and headline numbers. The script's own header (lines 13–22) explicitly disclaims: "What this script does NOT do: Bring up any of the 8 docker-compose stacks; Pull the Llama vision model; Authenticate Claude OAuth / OpenAI Codex subscriptions; **Run the Phase 1 analysis pipeline**". The script runs offline unit tests + a 12-PNG smoke. It does not regenerate the parquet outputs and it does not regenerate the analysis results. A reproducibility-auditor reviewer will clone, run the script, and discover that the headline κ = 0.361 cannot be reproduced from the script the paper points at.
Why EMSE will care: Reproducibility is the single hardest commitment a Methodological Article makes. A demonstrably false single-command-reproduction claim destroys the entire reviewer trust budget.
Proposed fix: Either (a) extend `reproduce_paper.sh` to call `analysis/analyze_judgments.py` against the committed parquets (so it actually reproduces Table 1–5), or (b) walk back every "single-command reproduction" claim to "the analysis pipeline reproduces from the committed parquets via `analysis/analyze_judgments.py`; the offline test suite is a separate `./scripts/reproduce_paper.sh`." Option (a) is the right one; the parquets exist on disk already.

## FINDING 4: GenAI-use disclosure promised in cover letter is missing from manuscript
Severity: BLOCKER
Reviewer persona: EDITORIAL
Location: cover letter line 21 vs. manuscript (search for "generative", "AI use", "copy-edit" — zero hits)
What's wrong: Cover letter line 21 states "Generative-AI use is disclosed in full inside the manuscript: the Claude Sonnet 4.5 model family is both a tool used in manuscript preparation (copy-editing, figure rendering) and one of the three LLM judges under evaluation; the disclosure names the model, version, and scope of each use." No such disclosure exists in the manuscript. EMSE explicitly requires generative-AI disclosure under its 2024 author guidelines; this disclosure is mandatory.
Why EMSE will care: EMSE will desk-check the GenAI disclosure block before sending the paper out for review. The cover letter writes a check the manuscript does not cash. Worse: this paper has the unusual property that the LLM being studied is also the LLM being used to write the manuscript — the recursive case the GenAI policy was authored to surface. The author's own skeleton.md line 3 commits to "no-AI-in-manuscript rule (Eldh, extended to all peer-reviewed venues including EMSE), every sentence of the manuscript prose must be authored by Suneet Malhotra directly". The cover letter contradicts this commitment.
Proposed fix: Add a "Generative AI Disclosure" section before References. State exactly which AI tools were used for what (copy-editing? figure rendering? prose drafting?). Resolve the contradiction: either the no-AI-prose commitment held (then say so) or it didn't (then say what AI did write).

## FINDING 5: Internal section numbering is incoherent
Severity: BLOCKER
Reviewer persona: EDITORIAL
Location: §1.5 roadmap (line 68) vs. actual headers throughout
What's wrong: The §1.5 roadmap (line 68) promises eight numbered sections: §2 Related Work, §3 Methodology, §4 harness as software artefact, §5 Phase 1 pilot protocol, §6 Phase 1 Results, §7 Discussion, §8 Threats to Validity, §9 Future Work. The actual manuscript has: §2 Related Work, §3 Methodology, §4 Results (mislabelled), §5 Discussion, §6 Threats to Validity, §7 Conclusion. There is no §4 harness section, no §5 pilot protocol section. Worse, the §4 Results header on line 209 is preceded by editorial scaffolding lines 200-207: "Manuscript §6 — Phase 1 Results (drop-in prose for skeleton §6.1) / Version: 1.0 (2026-06-09, generated from analysis/results/...) / Replaces: skeleton.md §4 Results placeholders (lines 130-162) for the Phase 1 pilot submission / Source data: results/judgments_2026-06-07T02-50-09-790Z.parquet … / Analysis script: analysis/analyze_judgments.py (commit 58f3940; bootstrap seed 42; 1000 resamples)." This is internal authoring-process metadata. Line 313 `## End of §6 prose` and line 315 "Word count: ~1,650 (within EMSE Methodological Articles target for the Results section of a methodological-pilot paper)" are also internal notes that leaked into the submission file. References to "§6.3 of the Results" appear at line 249 and §5/§6 prose, but Results is actually §4. References to "§7" appear at §6.1 line 383 but §7 is Conclusion not Phase 2 work.
Why EMSE will care: Internal scaffolding text in a "ready" manuscript signals the file was never edited end-to-end. A triage editor sees "drop-in prose for skeleton §6.1" and concludes the author submitted a working draft. Inconsistent cross-references force reviewers to chase numbering errors instead of reading content.
Proposed fix: Delete lines 200-208, 313, 315. Re-number sections: §4 (the current §4) becomes either §6 (matching roadmap) OR rewrite the §1.5 roadmap to match the actual structure. Find-replace every "§6.3 of the Results" → "§4.4". Find-replace every "§6.X of Results" mention in the Discussion. Verify every internal cross-reference resolves.

## FINDING 6: Bibliography is empty
Severity: BLOCKER
Reviewer persona: EDITORIAL
Location: line 433-435 (References section)
What's wrong: The References section reads in full: "[Bibliography to be assembled from inline bracketed citations across §1-§7 at final assembly. Citation count: ~25-30 unique sources.]". This is a placeholder. The paper makes 20+ inline citations (He et al. 2025, Hou et al. 2024, Fan et al. 2023, Wang et al. 2004, Barr et al. 2015, Sjøberg et al. 2007, Wohlin et al. 2012, Landis & Koch 1977, Cohen 1960, Cicchetti & Feinstein 1990, Fleiss 1971, McNemar 1947, Bates et al. 2015, Krawetz 2013, Olianas et al. 2026, Malhotra 2026a, Malhotra 2026b, Bird et al. — placeholder) but the bibliography to back them is not written. One of the cited works ("Bird et al. precedents in mining-software-repositories", line 94) is clearly a placeholder, not a real citation.
Why EMSE will care: A submission with no References section is a textbook desk-reject trigger. EMSE will not send this out for review.
Proposed fix: Write the bibliography. Verify every inline citation resolves to a real published work. Resolve the Bird-et-al. placeholder to a specific citation (e.g., Bird, Bachmann, Aune, Duffy, Bernstein, Filkov, Devanbu, "Fair and balanced? Bias in bug-fix datasets", ESEC/FSE 2009 — or whatever the intended reference actually is). Verify Olianas et al. 2026 BEWT is a real paper, not a hallucinated citation; if it is real, confirm the venue (the manuscript says both JSS and "Web E2E testing" with no concrete identifier).

## FINDING 7: "Single-author sole coding" mitigation is logically incomplete for §4.2 disagreement claim
Severity: MAJOR
Reviewer persona: LLM-EVAL
Location: §6.1 line 381 ("Single-author sole coding of Phase 1")
What's wrong: The mitigation argues "Coder bias cannot enter when the coder has no degrees of freedom" because ground truth is by construction. This is correct as far as it goes — but the by-construction defects were *also* designed and implemented by the same author (the six primitives in `injection/primitives.ts`). So the author had degrees of freedom in choosing (a) which defect categories to inject, (b) what magnitude of mutation per category (12px shift, 15° hue, max-width 60%, etc.), (c) what counts as a "defect" worth detecting. A 12-pixel layout shift is a defect; a 1-pixel layout shift is antialiasing noise. The choice of 12px is a researcher-degree-of-freedom that the by-construction framing obscures. Codex missing 1-in-3 z-order defects and Claude missing 1-in-8 might say something about z-order rendering, or it might say something about the swap_zindex primitive's implementation specifics. The pre-registration locks the *primitive names* but not the *magnitude parameters* per primitive at injection time.
Why EMSE will care: The hostile-but-fair reading is that ground truth is not as independent of the experimenter as "by construction" implies — it is by-experimenter-construction, which is exactly the problem human inter-rater agreement is supposed to address.
Proposed fix: Add a sentence acknowledging that the primitive-magnitude parameters (12px shift, 15° hue, max-width 60%) were author-chosen at primitive-implementation time, and that the choice of "detectable" defect magnitude is itself a researcher-degree-of-freedom. Either (a) cite that these magnitudes were locked in the pre-registration (verify in OSF §4.2 — they are NOT; OSF §4.2 names categories only), or (b) acknowledge this as an additional construct-validity threat in §6.3 and propose a Phase 2 sensitivity analysis on magnitude.

## FINDING 8: Pre-registration timestamp chronology has a 13-hour gap that needs disclosure
Severity: MAJOR
Reviewer persona: PRE-REG
Location: ARTIFACTS.md §5 line 162 + Highlights line 22 + §3 line 100
What's wrong: ARTIFACTS.md line 162 states: "The OSF pre-registration was registered on 2026-06-06. The first LLM judgment dispatch ran on 2026-06-06 19:50 PT (after registration)." The parquet filename `judgments_2026-06-07T02-50-09-790Z.parquet` confirms the first-judgment timestamp is 2026-06-07T02:50 UTC = 2026-06-06 19:50 PT. This is consistent. BUT: the pre-reg timestamp claim is only as strong as the OSF registration's actual published timestamp. The manuscript should report the OSF timestamp at minute-level precision (not just "2026-06-06"), because the same-day claim is the entire registered-before-execution chain of custody. A skeptical pre-reg methodologist will not accept "2026-06-06" without a UTC time and a screenshot/archive reference.
Why EMSE will care: Pre-reg methodologists specifically check that registration precedes the first observation. Same-day timestamps without sub-day resolution are exactly the case where this check fails most often.
Proposed fix: Report the OSF registration timestamp at minute precision (e.g., "registered on 2026-06-06 at 14:23 UTC, with first LLM judgment dispatched at 2026-06-07 02:50 UTC, a gap of 12h 27m"). Verify this independently against the OSF page. Include the screenshot or the OSF API timestamp in supplementary materials.

## FINDING 9: Fleiss' κ = -0.309 framing as "substantive disagreement signal" overclaims
Severity: MAJOR
Reviewer persona: LLM-EVAL
Location: §4.3 line 245
What's wrong: The paper says the negative Fleiss' κ "tells future benchmark designers that open-weights vision models at the 11B-parameter scale cannot be used interchangeably with frontier models for fine-grained visual-regression detection, at least not with the prompt protocol pre-registered in this study." This is exactly the over-claim the §5.2 capability-vs-format-artifact disclaimer is designed to prevent. If the 0% Llama recall might be a composite-format artifact (which §5.2 honestly admits), then the Fleiss' κ negative value is *also* an artifact of the composite format, not a property of 11B-parameter open-weights vision models. The benchmark-designers conclusion cannot be drawn from data where the format-vs-capability ambiguity is unresolved.
Why EMSE will care: An LLM-eval reviewer who has read He et al. 2025 will catch this. The §4.3 conclusion contradicts the §5.2 reservation. The paper cannot have it both ways: either the result is interpretable as a model-capability finding (and the §5.2 disclaimer is wrong) or it is unresolved (and the §4.3 conclusion is wrong).
Proposed fix: Rewrite §4.3 last sentence to: "The negative Fleiss' κ is a real, interpretable signal about *this protocol's three-judge distribution*, not about open-weights vision in general; whether it reflects a capability gap or a composite-format artifact is queued for Phase 2 disentanglement (§5.2)."

## FINDING 10: Claude-vs-Codex κ = 0.361 vs antecedent κ = 0.667 explanation is face-saving
Severity: MAJOR
Reviewer persona: LLM-EVAL
Location: §4.2 line 239 and §5.1 lines 327-331
What's wrong: The paper offers two structural explanations for the κ gap: (a) corpus size (random-chance correction tighter on N=400 than N=24) and (b) per-category blind spots not visible in the small corpus. Both are plausible but the author omits the most-obvious third explanation: the antecedent κ = 0.667 was *intra-judge* (the same Claude judge against itself across two runs), while the Phase 1 κ = 0.361 is *inter-judge* (Claude vs Codex). These are categorically different measurements. Intra-judge κ on one model has no comparability to inter-judge κ on two models — the comparison itself is methodologically suspect. The §4.2 line 239 phrasing "intra-judge result (κ = 0.667, substantial) on a smaller TodoMVC corpus" makes the comparison explicit yet doesn't flag the apples-to-oranges issue.
Why EMSE will care: Any LLM-eval reviewer will catch this. The whole motivating gap — "Phase 1 κ drops from antecedent's 0.667" — is misleading if the antecedent number was an intra-judge consistency measurement and the new number is an inter-judge agreement measurement.
Proposed fix: Add a sentence in §4.2 and §5.5: "The antecedent κ = 0.667 is an intra-judge consistency measurement (same Claude judge across two runs); the Phase 1 κ = 0.361 is an inter-judge agreement measurement (Claude vs Codex). These are different constructs; the comparison should be read as 'inter-judge agreement is meaningfully lower than intra-judge consistency, as expected', not as 'the original κ was overstated'." This honest framing actually *strengthens* the Phase 1 contribution because inter-judge κ is the harder benchmark.

## FINDING 11: Phase 1 / Phase 2 framing as "not an amendment" is defensible but needs one more sentence
Severity: MAJOR
Reviewer persona: PRE-REG
Location: §1.3 Contribution 3 line 56, §1.4 line 60, §5.4 line 361
What's wrong: The framing is honest but a pre-reg methodologist will demand the affirmative test: "what would Phase 1 have to look like for it to constitute an amendment?" The paper asserts the negative ("this is not an amendment") without giving the criterion that would falsify the assertion. A skeptical reviewer will say: "If Phase 1 reports any of the four pre-registered RQs, it's an amendment. The author claims it reports none. But §3.1 line 116 says 'No primary inference about RQ1–RQ4 is drawn from Phase 1 numbers' — which implies secondary or exploratory inference might be." That's enough wiggle for a hostile reviewer to argue the framing is rationalization.
Why EMSE will care: Pre-reg methodologists are the reviewer subclass most likely to reject on this point. The §5.4 line 363 "We propose this methodological-pilot framing as a reusable template" only works if the framing itself withstands the hostile test.
Proposed fix: Add to §1.4 (after the existing paragraph): "An operational test for whether Phase 1 is an amendment: does it report any analysis intended to inform interpretation of RQ1–RQ4? It does not. The per-judge accuracy, pairwise κ, and Fleiss' κ in §4 are reported as harness-validation evidence; the per-application breakdown in §4.5 is reported with the disclaimer that per-app labels are nominal; no claim is made about cross-application generalization (RQ1), application characteristics (RQ2), defect-category Pareto dominance (RQ3), or inter-LLM vs inter-human κ correlation (RQ4)."

## FINDING 12: Bootstrap CIs on per-category cells (n=64-72) are referenced but never reported
Severity: MAJOR
Reviewer persona: LLM-EVAL
Location: §6.4 line 405 + §4.4 Table 3 + §3.6 line 196
What's wrong: §6.4 line 405 honestly states "Per-category sample sizes range from 64 to 72 pairs, which yields per-category recall point estimates whose bootstrap CIs are wider than the corpus-level CI. We report the CIs honestly rather than suppressing the uncertainty." But Table 3 (line 254-260) does not actually report the per-category CIs. The cells show point estimates only (e.g., "Claude `layout` 76.6%"). The CIs are computed in `analyze_judgments.py` per §3.6 line 196 commitment, but they don't appear in the manuscript table. A reproducibility reviewer will check whether the analysis-output `.md` contains the CIs (it does not — I read `phase1_analysis_2026-06-09T23-03-16Z.md` and the per-category table at lines 60-67 also has no CIs).
Why EMSE will care: The §6.4 claim "we report the CIs honestly" is false; they are not in the table. A LLM-eval reviewer will demand them. With n=64 and Claude `layout` at 76.6%, the Wilson 95% CI is roughly [64%, 86%] — a 22-point spread that meaningfully changes the interpretation of "between-judge 25-point gap on z-order is the largest divergence" in §5.3.
Proposed fix: Compute per-category bootstrap CIs (the script already loops over judges and cells; just add a CI column). Add them to Table 3. Re-read §5.3 to confirm the cross-judge category-divergence claim still survives once the CIs overlap. If the divergences are within CI overlap, soften the §5.3 wording.

## FINDING 13: Zenodo DOI cited in header but §7 says "to be minted at submission"
Severity: MAJOR
Reviewer persona: REPRODUCIBILITY
Location: line 11 (header) vs. line 429 (§7 closing paragraph)
What's wrong: Line 11 states the Zenodo DOI 10.5281/zenodo.20620871 is already assigned. Line 429 says "with a Zenodo DOI to be minted at manuscript submission." These contradict. A reproducibility auditor will resolve the DOI to check what's archived; if the DOI is live, the §7 prose is stale. If the DOI is not live (or doesn't contain the artifacts), the header is wrong.
Why EMSE will care: Internal contradictions about artifact availability are a reproducibility-reviewer's favorite finding. Either Zenodo has the artifacts or it doesn't.
Proposed fix: If the Zenodo DOI is real and live (README.md line 105 says "Zenodo concept DOI 10.5281/zenodo.20620870 / version DOI 10.5281/zenodo.20620871"), update §7 line 429 to: "All Phase 1 artifacts ship under MIT/CC-BY 4.0 at the project repository and are archived at Zenodo (concept DOI 10.5281/zenodo.20620870; version DOI 10.5281/zenodo.20620871, minted 2026-06-XX)." If not live yet, remove the header citation.

## FINDING 14: "$0 marginal cost" claim conflicts with EMSE reproducibility expectations
Severity: MAJOR
Reviewer persona: REPRODUCIBILITY
Location: §4.7 line 295 + §3.4 lines 163-165 + ARTIFACTS.md §3 Step 3
What's wrong: All three judges are billed at $0.00 because subscription paths are used. This is true for the *author* but false for any *replicator* who does not hold Claude Max + ChatGPT/Codex subscriptions. The paper acknowledges this in §3.4 (subscription path) but presents the cost as "$0.00 marginal cost per call" in §4.7 without flagging that a replicator needs ~$40/mo (Claude Max) + $20/mo (ChatGPT Plus) + a 7GB local Llama install. The ARTIFACTS.md Step 3 names the subscription requirement but the manuscript's cost table does not.
Why EMSE will care: A Methodological Article whose reproducibility commitment includes "$0 cost" is misleading if it requires $60/mo in subscriptions. The honest framing is "subscription-amortized cost"; the API-key alternate path's actual per-call cost (which the harness supports) should be reported.
Proposed fix: Replace §4.7 with: "All three judges in the Phase 1 dispatch were billed at $0 marginal cost via subscription channels held by the author. A replicator using the API-key alternate paths (`gpt-4o-2024-11-20`, `claude-sonnet-4-5-20250929`, and Llama via Ollama) would incur approximately $X.XX for 1,200 judgments at 2026-06 pricing (see `oracles/llm_judge/cost_constants.ts`). Subscription-channel replication requires Claude Max (≈$X/mo) and ChatGPT Plus or Codex CLI access (≈$X/mo) at the time of writing."

## FINDING 15: Llama latency footnote on hardware honesty
Severity: MINOR
Reviewer persona: REPRODUCIBILITY
Location: §4.6 line 291
What's wrong: "approximately 50 minutes for the Llama re-run alone" on "Apple M-series, no GPU offload beyond Metal" — the exact M-series chip (M1/M2/M3 Pro/Max/Ultra) materially changes Llama inference speed by 2-5×. A replicator on an M1 Air will see substantially worse than 50 min; a replicator on an M3 Max will see better.
Why EMSE will care: Reproducibility-of-timing claims are weak; reproducibility-of-correctness claims are strong. This is the timing claim. State the chip.
Proposed fix: Replace "Apple M-series" with specific chip (e.g., "Apple M3 Pro, 36 GB unified memory"). Add a one-line note that wall-clock timing varies with hardware and the dispatch is embarrassingly parallel.

## FINDING 16: Methodological Articles scope-fit argument is implicit
Severity: MAJOR
Reviewer persona: EDITORIAL
Location: cover letter line 15 + manuscript has no scope statement
What's wrong: The cover letter says "We submit to the Methodological Articles track because the contribution shape is a method and an artifact, not a hypothesis test." This is the entire scope-fit argument. EMSE Methodological Articles per the journal's own description target "research that develops new (variants of) research methods, or that empirically examines the use of research methods in software engineering" — the second clause is the better fit here, but the cover letter doesn't make that case explicitly. A skeptical associate editor will ask: "Is this a Methodological Article or is it a Research Article reporting empirical pilot results dressed up as method?"
Why EMSE will care: Scope-track mismatch is the second-most-common desk-reject trigger after presentation issues. Tom Zimmermann is meticulous about track fit.
Proposed fix: Add one paragraph to the cover letter (after current paragraph 5) explicitly mapping the contribution to the Methodological Articles scope: "Per EMSE's Methodological Articles description, this manuscript both (a) presents a new method — the pre-registered Phase 1 / Phase 2 reporting split as a transferable pattern for LLM-eval SE work where infrastructure validation must precede confirmatory testing — and (b) empirically examines the use of LLM-as-Judge evaluation methodology, surfacing failure modes (Llama composite-vs-capability ambiguity) that the methodology must account for. The harness is the artifact; the Phase 1/Phase 2 split is the method; the failure-mode catalog is the empirical examination." Then verify the manuscript §1.3 contributions actually match this framing.

## FINDING 17: Per-app accuracy interpretation breaks own disclaimer in §4.5
Severity: MINOR
Reviewer persona: LLM-EVAL
Location: §4.5 line 279
What's wrong: §4.5 line 279: "The cal-com row (lowest for both frontier judges) suggests that the synthetic-HTML fixture parameterized for cal-com produces defect variants near the frontier judges' detection threshold; this is a corpus-property finding, not an application-property finding." This is the right framing — but then why include the per-app table at all? If the labels are nominal and the breakdown is a corpus-property statement, the table tells the reader nothing actionable. Including it invites the precise misinterpretation the disclaimer warns against (reader gives passing glance to the table, takes "cal-com hard, mattermost easy" as cross-app generalization).
Why EMSE will care: Tables are read more than disclaimers. Either drop the table or rewrite to make the corpus-not-application reading impossible to miss.
Proposed fix: Either (a) move Table 4 to an appendix with a stronger framing ("Per-nominal-app accuracy is reported for harness-debug purposes only; it does not measure real-application difficulty"), or (b) replace the per-app rows with the parameter values the synthetic renderer used per app, so the table directly shows what corpus property is varying.

## FINDING 18: Related Work §2.3 random-effects justification cites a placeholder
Severity: MAJOR
Reviewer persona: EDITORIAL
Location: §2.3 line 94
What's wrong: "[Bird et al. precedents in mining-software-repositories]" is a placeholder, not a real citation. Bird, Pattison, D'Souza, Filkov, Devanbu wrote "Latent Social Structure in Open Source Projects" (FSE 2008) and Bird et al. wrote on bug-fix datasets (ESEC/FSE 2009); neither is on random-effects mixed-effects models per se. The intended citation is probably one of: Bates, Mächler, Bolker, Walker (2015) `lme4`; Gelman & Hill (2007); or specific MSR papers using mixed-effects (Murphy-Hill, Zimmermann, Bird 2013 ICSE).
Why EMSE will care: A placeholder bibliography entry in a "ready" submission is amateur. Worse, an associate editor who knows the random-effects-in-SE literature will see that the citation is wrong.
Proposed fix: Replace with the actual paper(s) the random-effects-in-SE precedent rests on. Murphy-Hill, Zimmermann, Bird "How Do Users Discover New Tools?" (2014) is an actual mixed-effects SE precedent. If the intended reference is `lme4` itself, cite Bates et al. 2015 — but that's the software, not the empirical precedent.

## FINDING 19: Suggested-reviewers list quality is strong
Severity: NIT (positive finding)
Reviewer persona: EDITORIAL
Location: `_suggested_reviewers.md`
What's wrong: Nothing — this section is well done. Five reviewers, all verified, all with explicit confidence flags and dated email verifications. The EIC exclusions (Feldt, Zimmermann) and the JSS-conflict exclusions (Avgeriou, Shepherd) are correctly identified. Sigrid Eldh exclusion is appropriate and well-reasoned. Backup list (Ferrucci, Yue, Zeller, Xie) is sensible.
Why EMSE will care: A clean suggested-reviewers list is a credibility signal at submission time.
Proposed fix: None needed for the list itself. But: change the manuscript-title header on line 3 of `_suggested_reviewers.md` to match the manuscript's actual title (per Finding 1).

## FINDING 20: Threats to Validity §6 is appropriately scoped but understates one threat
Severity: MINOR
Reviewer persona: LLM-EVAL
Location: §6.3 line 397 (Cohen's κ paradox)
What's wrong: The κ-paradox treatment is correct as far as it goes. It misses one specific threat: with binary verdicts and ground truth = all `fail`, the Cohen's κ between the two frontier judges is technically also subject to the same paradox in a milder form — when both judges over-predict `fail` (because the corpus is 100% defect-pair), the κ between them is biased low by skewed marginals. The 0.361 figure is a *lower bound* on the agreement signal under the by-construction ground truth, not the true agreement on a balanced corpus. Phase 2's human-coded corpus (which will have some true negatives) is where κ becomes interpretable as designed.
Why EMSE will care: Cicchetti & Feinstein (1990) is correctly cited but only applied to the Llama case. The frontier-judge κ is also affected.
Proposed fix: Add a sentence to §6.3 after the Llama discussion: "The Claude-Codex κ = 0.361 is also affected by the by-construction marginal skew — with all 400 pairs being defect-pairs and both judges over-predicting `fail`, the random-chance correction in the κ denominator is non-negligible. Phase 2's corpus, which includes true-negative pairs by design, will produce a κ figure not subject to this asymmetry."

## FINDING 21: Cover letter does not mention the Zenodo DOI by number
Severity: MINOR
Reviewer persona: EDITORIAL
Location: cover letter line 15, line 21
What's wrong: Cover letter mentions "Zenodo-archived corpus" and "code and data are archived at GitHub and Zenodo with DOIs cited in the manuscript" but does not cite the DOIs explicitly. EMSE EICs scan the cover letter for the artifact-DOI citation directly; making them flip to the manuscript header is a small irritant.
Why EMSE will care: It's a one-second irritation, but it's avoidable.
Proposed fix: Add to cover letter paragraph 5: "Artifacts are archived at Zenodo (concept DOI 10.5281/zenodo.20620870; Phase 1 version DOI 10.5281/zenodo.20620871) and at GitHub (github.com/SuneetMalhotra/visual-oracle-bench)."

## FINDING 22: §3 has no leading number period ("# 3 Methodology" vs "# 1. Introduction")
Severity: NIT
Reviewer persona: EDITORIAL
Location: line 98
What's wrong: Header on line 98 is `# 3 Methodology` (no period after 3); every other top-level header uses `# N. Title`. Tiny inconsistency.
Why EMSE will care: It doesn't, but copy-editing inconsistencies signal an unedited submission.
Proposed fix: `# 3. Methodology`

## FINDING 23: Affiliation disclosure pattern is good but should also appear at end of paper
Severity: NIT
Reviewer persona: EDITORIAL
Location: line 5 header
What's wrong: Motorola affiliation is named only in the header. EMSE standard places the funding/affiliation disclosure at end-of-paper too, before References, in a "Disclosure" or "Conflicts of Interest" section. The skeleton.md §"DISCLOSURE STATEMENT" was planned but not transcribed.
Why EMSE will care: Standard journal practice; small but expected.
Proposed fix: Add a "Disclosure and Conflicts of Interest" section before References stating: no funding, affiliation for identification only, no proprietary data, no editorial-board COI.

## FINDING 24: Claim "10 minutes on a cold machine" is undertested
Severity: NIT
Reviewer persona: REPRODUCIBILITY
Location: §7 line 415
What's wrong: "reproduction-from-fresh-clone script that runs in approximately 10 minutes on a cold machine" — the ARTIFACTS.md §3 says "~3-5 min on a fresh clone with cached chromium; ~10-15 min cold". And per Finding 3, this script doesn't actually reproduce the manuscript numbers, only the offline test suite. Both timing and scope are off.
Why EMSE will care: Reproducibility timing claims are routinely fact-checked by auditor reviewers.
Proposed fix: Drop the timing claim, or pin it to "approximately 10-15 minutes for the offline test suite on a cold MacBook Pro M3; the LLM dispatch and analysis stages require ~30-50 min additional wall clock and the subscription/local-model prerequisites documented in ARTIFACTS.md §3".

---

## Unified findings table (sorted by severity)

| # | Severity | Persona | Section | Issue | Effort to fix (min) |
|---|---|---|---|---|---:|
| 1 | BLOCKER | EDITORIAL | Title vs cover letter vs reviewers list | Three different titles | 5 |
| 2 | BLOCKER | EDITORIAL | §Abstract | Abstract is empty | 60 |
| 3 | BLOCKER | REPRODUCIBILITY | §Highlights / §3.6 / §4 / §7 | `reproduce_paper.sh` doesn't reproduce headline numbers | 30 |
| 4 | BLOCKER | EDITORIAL | Missing GenAI disclosure section | Cover letter promises a disclosure that isn't in the paper | 30 |
| 5 | BLOCKER | EDITORIAL | §1.5 roadmap vs section numbers | Section numbering incoherent; scaffolding text leaked | 45 |
| 6 | BLOCKER | EDITORIAL | §References | Bibliography is empty placeholder | 120 |
| 7 | MAJOR | LLM-EVAL | §6.1 | "By construction" GT obscures author-degree-of-freedom in primitive magnitudes | 20 |
| 8 | MAJOR | PRE-REG | ARTIFACTS.md §5 + §3 line 100 | Pre-reg timestamp needs sub-day precision | 15 |
| 9 | MAJOR | LLM-EVAL | §4.3 | Negative Fleiss' κ overclaimed as "open-weights vision cannot be used" — contradicts §5.2 reservation | 10 |
| 10 | MAJOR | LLM-EVAL | §4.2 / §5.5 | Antecedent κ = 0.667 was intra-judge; Phase 1 is inter-judge; comparison is apples-to-oranges | 20 |
| 11 | MAJOR | PRE-REG | §1.4 | Phase-1-not-amendment claim needs the falsification criterion stated | 15 |
| 12 | MAJOR | LLM-EVAL | §4.4 Table 3 + §6.4 | Per-category CIs claimed but not in table; n=64-72 makes overlap likely | 45 |
| 13 | MAJOR | REPRODUCIBILITY | header line 11 vs §7 line 429 | Zenodo DOI cited in header, §7 says "to be minted" | 5 |
| 14 | MAJOR | REPRODUCIBILITY | §4.7 | "$0 cost" hides ~$60/mo subscription cost for replicators | 20 |
| 16 | MAJOR | EDITORIAL | cover letter | Methodological Articles scope-fit argument too thin | 20 |
| 18 | MAJOR | EDITORIAL | §2.3 line 94 | "Bird et al. precedents" is a placeholder citation | 15 |
| 15 | MINOR | REPRODUCIBILITY | §4.6 | "Apple M-series" too vague for timing reproducibility | 5 |
| 17 | MINOR | LLM-EVAL | §4.5 Table 4 | Per-app table invites the misinterpretation its caption forbids | 15 |
| 20 | MINOR | LLM-EVAL | §6.3 | κ-paradox treatment misses frontier-judge marginal-skew threat | 10 |
| 21 | MINOR | EDITORIAL | cover letter | Zenodo DOI not cited by number in cover letter | 5 |
| 19 | NIT | EDITORIAL | suggested reviewers | (Positive) — well-done list; title-on-line-3 needs update | 2 |
| 22 | NIT | EDITORIAL | §3 line 98 | Missing period in "# 3 Methodology" | 1 |
| 23 | NIT | EDITORIAL | end-of-paper | Add Disclosure / COI section | 10 |
| 24 | NIT | REPRODUCIBILITY | §7 line 415 | "10 min on a cold machine" undertested | 5 |

Aggregate fix-time (linear): ~520 minutes (≈ 8.5 hours). Realistic with proofread: 1.5 working days.

---

## VERDICT

### Probability of desk-acceptance as currently submitted: **5%**
Reasoning: Six BLOCKER findings, any one of which is a desk-reject trigger at EMSE. The missing abstract (Finding 2), missing bibliography (Finding 6), and missing GenAI disclosure (Finding 4) are individually fatal. The title mismatch (Finding 1) and the section-numbering scaffolding (Finding 5) signal a working-draft submission. The reproducibility-claim falsity (Finding 3) is the killer if it survives to a reviewer — EMSE will care more about this than about the numbers. Robert Feldt and Tom Zimmermann are unusually meticulous EICs; Feldt in particular will catch the GenAI disclosure gap (he has written publicly about the recursive case where the tool-of-study is also the tool-of-writing). Realistic outcome: desk-return with "please address presentation issues and re-submit" within 48 hours, no peer review.

### Probability of acceptance after Round 1 if Round 1 begins: **45%**
Reasoning: Conditional on the six BLOCKERs being fixed and the paper actually reaching reviewers, the methodological contribution is real and well-scoped. The Phase 1 / Phase 2 split is defensible to a pre-reg methodologist who reads §1.4 and §5.4 carefully (Finding 11 is a small fix). The Llama composite-vs-capability disclosure is honest (Falessi, Khomh on the suggested-reviewer list will register this as the right move). The κ = 0.361 finding is interpretable once the antecedent intra-vs-inter clarification (Finding 10) is added. The biggest Round-1 risks are: (a) reviewer pushes back on the "harness as primary contribution" framing and asks for a Phase 2 result before publishing (~30% chance), and (b) reviewer demands per-category CIs and finds the inter-judge category divergences are within CI overlap (~40% chance for at least one category). Both are major-revision-after-Round-1 outcomes, not rejections.

### Top 3 fixes that most move both probabilities:
1. **Write the abstract and the bibliography (Findings 2, 6).** These are the two non-negotiable triage-pass requirements. Together they move desk-acceptance from 5% to maybe 35%.
2. **Fix the `reproduce_paper.sh` claim — either extend the script to actually run the analysis pipeline, or walk back the "single-command reproduction" wording everywhere (Finding 3).** Reproducibility auditors will fact-check this. Moves both desk and Round-1 probabilities by ~10 points each.
3. **Add the GenAI-use disclosure section and resolve the recursive-use awkwardness honestly (Finding 4).** EMSE EICs are policy-strict on this; missing it is a desk-reject trigger. Also fixes the cover-letter-vs-manuscript contradiction. Moves desk-acceptance ~15 points; Round-1 ~5 points (less because Round-1 reviewers don't re-check this).

### Recommended decision: **MAJOR-REVISION-BEFORE-SUBMIT**

The manuscript is closer to **revise-before-ship** than to ship-tonight. The methodological contribution is real, the analysis is honest about its limits, the pre-registration chronology checks out, and the suggested-reviewers list is well-constructed. But the presentation has six BLOCKERs that no editor will overlook: empty abstract, empty bibliography, scaffolding text in the body, mis-numbered cross-references, missing GenAI disclosure, and a reproducibility-script claim that the script itself contradicts in its own comments. These are 1.5 days of focused proofreading + bibliography assembly, not a structural rewrite. Ship after that work; do not ship tonight. Submitting in current state risks a same-week desk-return that consumes the EIC's patience with the author across the three-paper Malhotra arc currently in flight.
