# Article 3 Phase 1 Venue Recommendation — 2026-06-09

**Author:** Suneet Malhotra
**Paper:** Visual Oracle Bench Phase 1 methodological pilot
**Constraint:** EB-1A filing target 2026-10-02 — submission needs to reach "Under Review" by ~2026-09-15 for clean petition timeline
**Not yet ready:** Phase 2 pre-registered 8-app live-Docker experiment (deferred to a future cycle)

---

## TL;DR

**Primary recommendation: EMSE Methodological Articles track (Empirical Software Engineering, Springer).**

Backups (in priority order):
1. **EASE 2027** (Evaluation and Assessment in Software Engineering, ACM)
2. **AIware 2026** (ACM Conference on AI Foundation Models and Software Engineering)
3. **ICSME 2026 NIER / Industry track** (IEEE International Conference on Software Maintenance and Evolution)

**DO NOT submit to:** JSS (Article 2 collision), IEEE Software (Article 1 collision), ICSE SEIP (Suneet is now on the PC — conflict of interest), TOSEM (too slow for filing timeline), AAAI/ICML/NeurIPS (wrong field — AI venues, not SE venues).

---

## Why EMSE Methodological Articles is the right primary

| Dimension | EMSE Methodological Articles | Why it fits |
|---|---|---|
| **Article type** | Methodological / Reproducibility / Registered-Report track | Phase 1 IS a methodological contribution: harness + pre-registered protocol + failure-mode catalog. Not a confirmatory empirical paper. |
| **Venue prestige** | Q1 software-engineering journal, indexed in major databases, recognized by USCIS adjudicators | Strong criterion (vi) evidence |
| **Field fit** | Empirical SE, with growing track of LLM-as-Judge methodological papers post He et al. 2025 SLR | Exact wheelhouse |
| **No venue collision** | Article 1 was sent to IEEE Software (magazine), Article 2 to JSS — no conflict | Clean |
| **Reproducibility emphasis** | EMSE has been pushing reproducibility commitments since 2021; pre-registered methodological papers are explicitly welcomed | OSF pre-reg + Zenodo + open data + open code = textbook fit |
| **Timeline** | First-decision typically 60-120 days. If submitted by 2026-07-15, first decision ≈ 2026-09-15 to 2026-11-15. Reasonably likely to reach "Under Review" by 2026-09-15, which is the EB-1A filing-readiness milestone. | Workable |
| **Honest scope match** | Methodological Articles explicitly accept "the methodology IS the contribution" — perfect for Phase 1's "harness + protocol + failure modes" framing | Avoids the trap of overclaiming Phase 2 evidence |

### What EMSE Methodological reviewers will look for
1. Pre-registration timestamp predates data collection ✅ (OSF DOI 10.17605/OSF.IO/NKD6J, registered 2026-06-06; first judgment 2026-06-06 19:50)
2. Open code + open data + reproducibility manifest ✅ (MIT + CC-BY 4.0 + ARTIFACTS.md + Zenodo DOI to mint)
3. Honest scope: what the paper does and does NOT claim ✅ (Phase 1 / Phase 2 split is prominent throughout skeleton)
4. Bootstrap CIs on all reported metrics ✅ (analysis script uses 1,000 resamples, seed 42)
5. Failure-mode catalog ✅ (Llama composite workaround is a textbook honest finding)
6. Single-rater limitation discussed honestly ✅ (ground truth is by-construction in Phase 1; no human inter-rater needed in synthetic regime — Phase 2 will require human inter-rater)

### What could weaken the submission
- **Synthetic-HTML corpus.** A reviewer may push back: "you ran 400 pairs but they're all from one HTML fixture; per-app labels are nominal." Response: the manuscript already discloses this prominently. The contribution is the harness + protocol, NOT cross-app generalization (which is Phase 2).
- **Small N for some claims.** Per-category breakdowns will have ~67 pairs per category. Bootstrap CIs should be wide and honestly reported.
- **No human inter-rater for Phase 1.** Acceptable because ground truth is mechanically known (defects were programmatically injected). Manuscript must say this explicitly.

---

## Backup venue analysis

### Backup 1 — EASE 2027 (Evaluation and Assessment in Software Engineering)

- **Type:** ACM conference, June 2027 (Lisbon, Portugal)
- **CFP cycle:** Typically opens ~Sept 2026, full-paper deadline ~Jan 2027
- **Why fit:** Empirical SE methodology focus, explicitly accepts methodological/registered-report contributions
- **Why backup, not primary:** Conference cadence means submission is too late for the 2026-10-02 EB-1A filing. Petition would have to cite "submitted to EASE 2027" which is weaker than "under peer review at EMSE."
- **When to use:** If EMSE rejects, EASE 2027 is the natural fallback. Manuscript only needs minor reframing (conference 12-page limit vs journal length).

### Backup 2 — AIware 2026 (ACM Conf on AI Foundation Models and Software Engineering)

- **Type:** ACM conference, Nov 2026 (after EB-1A filing target — useful for post-filing strengthening, not the original filing)
- **CFP cycle:** Typically opens ~April 2026, paper deadline ~July 2026 — may still be open or close to closing
- **Why fit:** Directly on-topic (AI agents + SE evaluation), accepts methodological papers
- **Why backup, not primary:** Less prestigious than EMSE; better positioned for cross-citation in Phase 2 rather than as Phase 1's primary venue. Also: paper deadline might already have passed.
- **When to use:** If EMSE timeline slips OR if you want a second short-paper submission of the failure-mode catalog as a focused contribution.

### Backup 3 — ICSME 2026 NIER / Industry track (Sept 2026)

- **Type:** IEEE conference, Sept 2026
- **CFP cycle:** Already closed for 2026; reopens for 2027 around April 2027
- **Why fit:** Software maintenance + tooling, accepts industry-track papers
- **Why backup-only:** 2026 deadline missed; 2027 too far out for filing timing
- **When to use:** If both EMSE and EASE reject, ICSME 2027 NIER (~April 2027 deadline) is a viable conference fallback for post-filing strengthening.

---

## Venues to AVOID and why

| Venue | Reason to avoid |
|---|---|
| **JSS (Journal of Systems and Software)** | Article 2 already there (manuscript JSSOFTWARE-D-26-01260). Submitting Article 3 to the same venue creates editor-perception of self-bundling, possibly affecting both papers. |
| **IEEE Software (Magazine)** | Article 1 (Specification Enrichment) is there as editor-invited submission. Same collision concern. |
| **ICSE 2027 SEIP track** | **Suneet was just accepted to the PC** (2026-06-08, Helena Holmström Olsson). Authoring a paper at the same track creates an obvious conflict of interest. |
| **TOSEM (Transactions on Software Engineering and Methodology)** | Review cycle is 6-18 months. Too slow for 2026-10-02 filing. |
| **NeurIPS / ICML / ICLR / AAAI** | Wrong field — these are AI venues. Reviewer pool will not understand the SE-context contribution. Article 3 is SE empirical, not ML methodology. |
| **arXiv only (no peer review)** | USCIS adjudicators discount preprints. Petition needs venue acceptance, not preprint alone. (arXiv crosspost is fine *after* venue submission.) |
| **Workshops without proceedings** | No archival peer review = weak criterion (vi) evidence. Skip. |
| **MDPI journals** | Pay-to-publish reputation; USCIS adjudicators flag MDPI specifically. Akanksha would push back. |
| **Predatory journals** | Obviously. Beall's list as the rough screen. |

---

## Submission timeline plan

Assuming EMSE Methodological Articles as primary:

| Week | Date | Action |
|---|---|---|
| W-5 (this week) | 2026-06-09 to 2026-06-15 | Finish Phase 1 analysis (Llama re-run + analysis script run); draft §6.1 with real numbers |
| W-4 | 2026-06-16 to 2026-06-22 | Draft §4 Results + §5 Discussion based on Phase 1 numbers; update §1 Intro to Phase-1-honest framing |
| W-3 | 2026-06-23 to 2026-06-29 | Draft §6 Threats to Validity (Phase 1 boundary section); §7 Conclusions and Future Work (Phase 2 framing) |
| W-2 | 2026-06-30 to 2026-07-06 | Mint Zenodo DOI for Phase 1 code+data snapshot; tag repo `v0.3.0-phase1-pilot`; finalize ARTIFACTS.md |
| W-1 | 2026-07-07 to 2026-07-13 | Pre-submission editorial inquiry to EMSE EiC (same pattern as JSS pre-sub); revise based on response |
| **W0** | **2026-07-14 to 2026-07-20** | **Submit to EMSE Methodological Articles track via Springer's Editorial Manager** |
| W+4 | ~2026-08-15 | Expected to reach "Under Review" status (passes desk review) |
| W+12 | ~2026-10-10 | First decision expected (likely "Major Revision") |
| EB-1A filing | 2026-10-02 | Petition cites: "Visual Oracle Bench Phase 1 — Under Review at EMSE Methodological Articles, submitted 2026-07-14, manuscript ID [from EM]" |

---

## Pre-submission editorial inquiry — when and what to ask

Same playbook as the JSS Article 2 inquiry (which got useful guidance from Avgeriou/Mendez):

**Recipient:** EMSE Editors-in-Chief (current EICs: Robert Feldt, Tom Zimmermann — verify before sending)
**Subject:** Pre-submission fit-check for EMSE Methodological Articles — multi-application LLM-as-Judge benchmark (pre-registered Phase 1 pilot)
**Body sketch:**
- Brief problem statement (one paragraph)
- Pre-registration timestamp + OSF DOI
- What Phase 1 reports (numbers, when available from analysis)
- What Phase 1 does NOT report (the Phase 2 RQ1-RQ4 deferral)
- Why it fits Methodological Articles track specifically (vs. confirmatory empirical)
- Ask: does this fit the track or is Research Article track more appropriate?

Send by ~2026-07-07. Wait up to 14 days for response. Submit by 2026-07-20 regardless.

---

## Andreessen-mode bottom line

**Submit to EMSE Methodological Articles by 2026-07-20.** The pre-registration is your strongest single asset; EMSE values pre-registered methodological work; the venue is field-fit; the timeline fits the filing deadline; there are no venue collisions.

If EMSE rejects or steers you elsewhere via pre-sub inquiry, fall back to EASE 2027 (conference) — slightly weaker but acceptable for petition citation as "submitted to EASE 2027."

Do NOT wait for Phase 2 to complete. Phase 1 alone is a defensible methodological pilot AT EMSE Methodological track. Holding for Phase 2 means missing the filing date.

---

**Status of this doc:** Recommendation locked 2026-06-09. Subject to revision if Akanksha pushes back on venue choice (her 2026-06-04 guidance was: scholarly articles primary, with IEEE Software as the highest-priority venue for Article 2 — but Article 3 was always EMSE-direction in the original plan).
