# Final Pre-Submission Audit — Article 3 v1.6 (fourth-reviewer pass)

**Date:** 2026-06-11 · **Auditor:** fresh-context final reviewer · **Inputs:** repo at `098974c` (tag `v1.6.0-emse-option-b`), analyzer re-run `phase1_analysis_2026-06-11T06-24-51Z`, `paired_tests_latest.json`, uploaded submission PDF.

## Section A — Cross-reference audit

| # | Commitment | Result | Evidence |
|---|---|---|---|
| 1 | Title (manuscript) | **MATCH** | Manuscript line 1 = "Visual Oracle Bench (Phase 1): A Two-Judge Synthetic-HTML Pilot for LLM-as-Judge Visual Regression Detection with Specificity Reporting". CITATION.cff line 3 uses "— Two-Judge…" (em-dash form, drops "A") — punctuation variance only; see punch list #3. Confidence: high |
| 2 | Claude n=208, Codex n=375 | **MATCH** | Analyzer: "`claude-oauth` … (n_valid=208); `openai-codex` … (n_valid=375)". Confidence: high |
| 3 | κ=0.679 [0.565, 0.788], n=208 | **MATCH** | Analyzer κ table row: "208 \| 0.679 \| [0.565, 0.788] \| substantial". Confidence: high |
| 4 | κ=0.423 [0.277, 0.583], n=83 defect-only | **MATCH** | `paired_tests_latest.json` → `defect_only_kappa: {n: 83, kappa: 0.423, ci95: [0.277, 0.583]}`. Confidence: high |
| 5 | 617 rows re-flagged | **MATCH** | Analyzer stderr: "WARN: re-flagged 617 rows as malformed=True based on silent-fabrication signature". Confidence: high |
| 6 | Codex spec 100%, TN=200, FP=0 | **MATCH** | Analyzer row: "`openai-codex` \| 375 \| 128 \| 0 \| 200 \| 47 \| 87.5% \| 73.1% \| 100.0%". Confidence: high |
| 7 | Claude spec 100%, TN=125, FP=0 | **MATCH** | Analyzer row: "`claude-oauth` \| 208 \| 38 \| 0 \| 125 \| 45 \| 78.4% \| 45.8% \| 100.0%". Confidence: high |
| 8 | McNemar p ≈ 6.0×10⁻⁸, 25/0 discordant | **MATCH** | JSON: `{claude_only_correct: 0, codex_only_correct: 25, p_exact: 5.96e-08}`. Confidence: high |
| 9 | Both judges 0% z-order in clean subsets | **MATCH** | Analyzer per-category: "zorder \| 0.0% (n=9) … \| 0.0% (n=27)". Confidence: high |
| 10 | Claude clean defects confined to profiles 1–2 | **MATCH** | JSON: `claude_clean_defect_rows_by_profile: {cal-com: 50, conduit: 33}` (= synthetic_profile_1/2; mapping disclosed in §3.2). Confidence: high |
| 11 | Phase 1 stated as unregistered pilot | **MATCH** (one residue) | §1.5: "it is an unregistered pilot, reported with that status". Cover letter: "Phase 1 is not covered by the registration … all of its analyses carry exploratory status". Residue: Highlights final bullet still reads "separately-framed methodological pilot" — punch list #2. Confidence: high |
| 12 | OSF DOI consistent manuscript ↔ amendment | **MATCH** | Both cite 10.17605/OSF.IO/NKD6J; amendment states Phase 2 unchanged. Confidence: high |
| 13 | JSS Article 2 only named concurrent submission | **MATCH (status unverifiable externally)** | Cover letter "Concurrent submissions": JSSOFTWARE-D-26-01260 only; no IEEE Software claim. The *current* JSS status cannot be independently verified from here → CHECK request to author in Section F. Confidence: high (text), unknown (live status) |
| 14 | Llama absent from headline κ/metric tables | **MATCH** | All Llama mentions are: Highlights exclusion bullet, abstract Method, Contribution 3, §1.5/roadmap, §3.4 (exclusion spec), §4 reconciliation note, §4.8 non-establishes, §6.3, §7 lesson 6, Appendix A. No comparative table contains Llama. Confidence: high |
| 15 | Cover letter addressed to current EMSE EiCs | **MATCH** | WebSearch (Springer journal 10664 editors page, emsejournal.github.io): EiCs Robert Feldt and Thomas Zimmermann, current as of 2026-06. Confidence: high |
| 16 | New Zenodo version DOI minted at submission tag | **MISMATCH — pending user action** | Manuscript header + Data Availability + PDF all carry `10.5281/zenodo.TBD-VERSION-DOI` placeholder. No mint commit exists. Mint requires the token at `~/.config/zenodo/token` on the author's machine. Punch list #1 (BLOCKER, user-run). Confidence: high |
| 17 | All referenced commit hashes exist | **MATCH** | `git rev-parse` OK for 9352483, da1f70a, 0745d7b, 3ab2373, 098974c, eaf1e4d. Confidence: high |

## Section B — Gap audit

1. §3.5 four detection signals + `_flag_silent_fabrications()` — **PRESENT** (§3.5 item 1).
2. Specificity upper-bound / benign-change caveat — **PRESENT** (§4.8(b), §5.2, §6.4 binary-verdict para).
3. Six practitioner lessons — **PRESENT** (§7, lessons 1–6, each tied to a Phase 1 observation).
4. Cover letter track-fit with evidence — **PRESENT** (¶"What the methodological contribution is": two named methods, both demonstrated on own data).
5. README Data Integrity dated section — **PRESENT** ("Silent-fabrication discovery and correction (2026-06-10/11)").
6. ARTIFACTS.md contaminated parquet + "retained for audit" — **PRESENT** ("Retained unmodified for audit: 392 Claude + 225 Codex rows…").
7. ARTIFACTS.md top-up parquet — **PRESENT** (`judgments_2026-06-11T03-17-58-910Z.parquet`).
8. ARTIFACTS.md top-up manifest — **PRESENT** (`data/images/_topup_codex_2026-06-11.json`).
9. ARTIFACTS.md launch script — **PRESENT** (`scripts/launch_full_dispatch_2026-06-11.sh`, §7 item 0 + scripts table).
10. Amendment states Phase 2 unchanged — **PRESENT** ("The pre-registered Phase 2 design and analysis plan are unchanged").
11. Amendment points at `_flag_silent_fabrications` — **PRESENT** (function path quoted).
12. "Reproducible from released parquets without LLM calls" — **PRESENT** (§4 intro + Data Availability).
13. Cover letter GenAI disclosure — **PRESENT** (final ¶: Claude as preparation tool and judge under evaluation).
14. CITATION.cff new title — **PRESENT** (no "Multi-Application"; punctuation variance noted at A1).
15. CITATION.cff authors = Suneet only — **PRESENT**.
16. package.json contributors — **PRESENT/clean** (no contributors field; `@anthropic-ai/sdk` is a dependency, exempt).

## Section C — Prose-register audit

| Section | Reads as | Strongest evidence | Confidence |
|---|---|---|---|
| Abstract | MIXED | "on which a judge that always answers 'fail' scores perfectly — specificity is unmeasured" (em-dash pivot; content practitioner-real) | moderate |
| §1 Introduction | MIXED | "Those numbers were wrong in the flattering direction, and nothing in the analysis outputs flagged them" (good); residual antithesis: "The visible artifact is what the user perceives, but the DOM is what most test suites measure" | moderate |
| §5 Discussion | MIXED→HUMAN | "What the data rule out is a sensitivity/specificity trade" (practitioner); residual aphorism: "it is the tripwire that catches a silently broken pipeline" | moderate |

No banned marketing vocabulary, no signposting adverbs ("moreover/furthermore/additionally/notably") in the canonical files (grep-verified). Uniform "(confidence: …)" tags are a deliberate, mission-mandated device, not an accident — retain. Flagged passages with rewrites:

- C1 (§4 intro): "The headline findings, stated up front including the unflattering ones:" → "The headline findings, negative ones included:" — punch #4.
- C2 (§5.2): "A corpus with cases where the lazy default answer is wrong is not just better measurement; it is the tripwire that catches a silently broken pipeline." → "Control pairs double as a pipeline tripwire: they are the only rows on which a silently broken judge produces impossible aggregates." — punch #5.
- C3 (§6 intro): "leading with the one we created ourselves." → "beginning with the silent-fabrication contamination." — punch #6.
- Not flagged for change: §1.1 antithesis sentence (load-bearing definition), §7 epigrams (already deflated in 098974c), em-dash density (reduced in 098974c; residual level is within normal academic register).

## Section D — Reproducibility audit

Fresh analyzer run (2026-06-11T06-24-51Z): re-flagged 617 ✓; Claude acc=78.4% spec=100.0% n_valid=208 ✓; Codex acc=87.5% spec=100.0% n_valid=375 ✓; κ=0.679 [0.565, 0.788] n=208 ✓; per-category and per-profile tables byte-identical to the committed 04-39-28Z report. `paired_tests.py` regenerates McNemar/Holm/defect-only-κ exactly. Drift: 0.000 on every point estimate and CI endpoint (same seed, same data). Uploaded submission PDF spot-checked (pages 1–2): title, Highlights, and abstract match the canonical markdown including 0.423 and the attrition-confined wording — the PDF is current except for the TBD DOI string (punch #1). **No mismatch.**

## Section E — Punch list

| # | Severity | Scope | Location | Fix | Confidence |
|---|---|---|---|---|---|
| 1 | **BLOCKER** (user-run; submission-stops) | numeric-swap ×3 + PDF rebuild | manuscript line 11, Data Availability ¶, cover letter archive ¶; then PDF | On the author's machine: `python3 scripts/mint_zenodo_doi.py --tag v1.6.1-emse-option-b --substitute`, commit the substitution, rebuild the PDF. (Token lives at `~/.config/zenodo/token`; not available in this environment.) | high |
| 2 | MINOR | single-line rewrite | manuscript Highlights, final bullet | "Phase 1 is a separately-framed methodological pilot; the registered Phase 2 live-capture experiment is deferred and unchanged." → "Phase 1 is an unregistered pilot reported with exploratory status; the registered Phase 2 live-capture experiment is deferred and unchanged." (aligns with §1.5 + cover letter) | high |
| 3 | MINOR | numeric-swap | CITATION.cff line 3 | Title → `"Visual Oracle Bench (Phase 1): A Two-Judge Synthetic-HTML Pilot for LLM-as-Judge Visual Regression Detection with Specificity Reporting"` (exact match to manuscript) | high |
| 4 | MINOR | single-line rewrite | manuscript §4 intro | C1 rewrite above | high |
| 5 | MINOR | single-line rewrite | manuscript §5.2 | C2 rewrite above | high |
| 6 | MINOR | single-line rewrite | manuscript §6 intro | C3 rewrite above | high |
| 7 | MINOR | numeric-swap ×4 | manuscript line 11 + Data Availability, cover letter, README reproducibility bullet, CITATION.cff comment | Update submission-tag references `v1.6.0-emse-option-b` → `v1.6.1-emse-option-b` (the post-audit tag the mint will target) | high |

## Section F — Verdict

**FIX-THEN-SHIP.**

Every number in the manuscript, cover letter, and PDF ties out exactly to the released analyzer and paired-test artifacts at zero drift; all six referenced commits exist; the Llama quarantine holds; the unregistered-pilot framing is consistent across §1.5, §3, the cover letter, and the OSF amendment (one residual Highlights bullet, punch #2); the EiC addressees are verified current; and the prior reviewers' demands (defect-only κ, selection-bias quantification, profile-naming disclosure, prevalence framing) are all implemented and artifact-backed. The remaining items are three one-line prose touches, two metadata alignments, and one genuine submission-stopper: the Zenodo version DOI is still a TBD placeholder because minting requires the author's token. That single item is scripted and takes minutes on the author's machine; everything else in the punch list is applied in Phase 2 of this audit. Estimated Phase 2 duration: under 30 minutes including commit, tag `v1.6.1-emse-option-b`, and self-audit. No new Zenodo mint is triggered by Phase 2 itself (prose/metadata only; no number, table, or data artifact changes).

**CHECK request to author (per stop-conditions):** confirm Article 2's JSS status (JSSOFTWARE-D-26-01260) is still "under review" with no editor decision before signing the cover letter — its status cannot be verified from this environment.
