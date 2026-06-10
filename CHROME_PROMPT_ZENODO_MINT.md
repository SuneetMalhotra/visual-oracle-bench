# Chrome prompt — Mint Zenodo DOI for Article 3 Phase 1 snapshot

**Use BEFORE the EMSE submission Chrome prompt.** Mints the Zenodo DOI that EMSE's data-availability statement needs to cite.

Paste into Claude.ai in Chrome (signed into GitHub `SuneetMalhotra` AND Zenodo with GitHub OAuth).

---

```
You are minting a Zenodo DOI for Suneet Malhotra's Article 3 Phase 1
submission snapshot. Today is whatever Chrome shows. Total time
expected: ~15 min in browser.

# CONTEXT

Repo: https://github.com/SuneetMalhotra/visual-oracle-bench
Branch: main
Target release tag: v0.3.0-phase1-pilot
Author: Suneet Malhotra (ORCID 0009-0003-8707-9590)
Zenodo concept-DOI lineage: this is a NEW Zenodo deposit (Article 3 is
       distinct from the Article 2 agent-harness deposit at
       10.5281/zenodo.20576685 — do NOT reuse that DOI).

# WORKFLOW

## Step 1 — Verify Zenodo ↔ GitHub OAuth integration is connected

Open https://zenodo.org/account/settings/github/. The
SuneetMalhotra/visual-oracle-bench repository should appear in the list.

If it does NOT appear (because Zenodo's GitHub integration wasn't set up
for this repo), enable it: toggle the repository's switch ON. Zenodo
will then watch the repo for new GitHub releases and auto-create a
deposit when one is published.

If you do NOT see the GitHub integration page at all, the user needs to
go to https://zenodo.org/account/settings/github/ and authenticate
with GitHub first. STOP and tell the user.

## Step 2 — Create the GitHub release (this triggers the Zenodo deposit)

Open https://github.com/SuneetMalhotra/visual-oracle-bench/releases/new

Fill:
- Choose a tag: v0.3.0-phase1-pilot (CREATE NEW TAG — type the name; GitHub
  will offer "Create new tag: v0.3.0-phase1-pilot on publish")
- Release title: Visual Oracle Bench v0.3.0 — Phase 1 Methodological Pilot
- Description: paste this verbatim:

```
Phase 1 methodological pilot snapshot for the EMSE Methodological Articles
submission.

What this release includes:
- Reusable benchmark harness (injection primitives, capture orchestrator,
  dispatcher, 3 pre-registered LLM judges, parquet result schema)
- Phase 1 synthetic-HTML corpus: 800 PNG pairs across 8 nominal app labels
  × 6 defect categories
- Phase 1 dispatcher output: 1,200 LLM judgments across Claude Sonnet 4.5,
  OpenAI gpt-5-codex, Llama 3.2 Vision 11B (in results/)
- W8 analysis pipeline (analysis/analyze_judgments.py) + outputs
  (analysis/results/phase1_analysis_*.json|md)
- Llama composite workaround (sharp-based) documented in
  oracles/llm_judge/llama_ollama.ts and unit-tested in
  tests/test_llama_composite_unit.ts
- Reproducibility manifest (ARTIFACTS.md)
- Manuscript draft (manuscript/article3_phase1_v1.md)
- Pre-registration text (preregistration/draft.md), also archived at
  OSF DOI 10.17605/OSF.IO/NKD6J

Headline Phase 1 numbers (all reproducible from analysis/results/phase1_analysis_*.md):
- Claude Sonnet 4.5 accuracy 88.8% (n=400)
- OpenAI gpt-5-codex accuracy 88.2% (n=400)
- Llama 3.2 Vision 11B accuracy 0.0% (n=400, all "pass")
- Claude × Codex Cohen's κ = 0.361 [95% CI 0.219, 0.499] (fair)
- Fleiss' κ across 3 judges = -0.309 [95% CI -0.350, -0.265]
- All judges $0 marginal cost (subscription + local paths)

License: MIT (code), CC-BY 4.0 (data, images, judgments, ground truth)
```

- Set as the latest release: CHECK
- Pre-release: UNCHECK

Click "Publish release".

## Step 3 — Wait for Zenodo to auto-create the deposit

Zenodo polls GitHub for new releases approximately every few minutes.
Refresh https://zenodo.org/account/settings/github/ after ~2-5 minutes
and look for "visual-oracle-bench" with a new version listed under the
release name.

When the deposit appears, click into it.

## Step 4 — Enrich Zenodo metadata

Zenodo prefills minimal metadata from the GitHub release. Click "Edit"
on the deposit and add:

- Title (verify): Visual Oracle Bench v0.3.0 — Phase 1 Methodological Pilot
- Authors: Malhotra, Suneet (ORCID 0009-0003-8707-9590); affiliation
  "Independent researcher in software quality engineering / Senior
  Manager, Test Engineering at Motorola Solutions (affiliation for
  identification only)"
- Description: paste from GitHub release description (Zenodo accepts the
  same Markdown-ish text)
- Resource type: Software
- License: MIT (for code) — but Zenodo only takes one top-level license,
  so select MIT and add in description "Data files under CC-BY 4.0 (see
  LICENSE-DATA in repository)"
- Keywords: LLM-as-Judge, software testing, visual regression, empirical
  software engineering, pre-registration, reproducibility, methodological
  pilot, benchmark
- Related identifiers:
  - "is supplement to" → OSF pre-registration DOI 10.17605/OSF.IO/NKD6J
  - "is part of" → research program GitHub URL
    https://github.com/SuneetMalhotra
- Communities: search for "computer-science", "software-engineering" or
  similar and join any that fit (skip if none found)
- Funding: none

Click "Save" then "Publish".

## Step 5 — Capture the minted DOI

After publish, Zenodo displays the deposit's DOI in format
"10.5281/zenodo.XXXXXXXX". Capture this DOI.

Also capture the **concept DOI** (the resolver that always points to
the latest version) — usually one number off from the version DOI;
shown on the deposit page as "Cite all versions? You can cite all
versions by using the DOI 10.5281/zenodo.YYYYYYYY".

Report BOTH:
- Version DOI for v0.3.0-phase1-pilot: 10.5281/zenodo.<version_id>
- Concept DOI: 10.5281/zenodo.<concept_id>

## Step 6 — Verify resolution

Open in a new tab: https://doi.org/10.5281/zenodo.<version_id>

Confirm page resolves to the visual-oracle-bench deposit.

## Step 7 — Take screenshots

- The Zenodo deposit page showing the DOI
- The DOI resolution page

Save to:
~/Desktop/EB-1A/02_EVIDENCE_ARCHIVE/I_Scholarly_Articles_criterion_vi/Article_3_Visual_Oracle_Bench/zenodo/
as:
- zenodo_deposit_v030_phase1_<YYYY-MM-DD>.png
- zenodo_doi_resolution_<YYYY-MM-DD>.png

# WHAT TO REPORT BACK

Tell the user:
1. Status: DOI_MINTED | BLOCKED_AT_STEP_<N>
2. Version DOI (10.5281/zenodo.XXXXXXXX)
3. Concept DOI (10.5281/zenodo.YYYYYYYY)
4. Screenshot paths
5. Anything unexpected

# DISCIPLINE

- Do NOT reuse the agent-harness Zenodo DOI (10.5281/zenodo.20576685) —
  Article 3 is a separate deposit
- Do NOT publish a release that overrides an existing tag — verify
  v0.3.0-phase1-pilot does not already exist before clicking Publish
- Do NOT mark this as a "Pre-release" — it must be a stable release for
  Zenodo to archive
```

---

# After this prompt completes — what to do next

1. Substitute the minted DOI into 4 files:
   - `manuscript/article3_phase1_v1.md` (Data Availability section)
   - `manuscript/sections/04_results.md` (if it cites a DOI)
   - `ARTIFACTS.md` (Section 8 — Version pinning)
   - `CITATION.cff` (new `identifiers:` entry of type DOI)

2. Re-run verification: `./scripts/verify_submission_ready.sh` — expect **32/32 PASS**

3. Run the hostile-review prompt (next file: `HOSTILE_REVIEW_PROMPT.md`)

4. Fix any BLOCKER findings from hostile review

5. Run the EMSE submission Chrome prompt (next file: `CHROME_PROMPT_EMSE_SUBMISSION.md`)
