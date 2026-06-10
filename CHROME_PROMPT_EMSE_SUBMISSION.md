# Chrome prompt — EMSE Methodological Articles submission via Editorial Manager

**Use AFTER:**
- ✅ `./scripts/verify_submission_ready.sh` exits 0 (32/32 gates pass)
- ✅ Zenodo DOI minted (run `CHROME_PROMPT_ZENODO_MINT.md`)
- ✅ Hostile review run (`HOSTILE_REVIEW_PROMPT.md`) and all BLOCKER findings closed
- ✅ Manuscript PDF assembled (run `pandoc manuscript/article3_phase1_v1.md -o ~/Desktop/article3_phase1_emse.pdf --pdf-engine=xelatex -V geometry:margin=1in -V mainfont="Times New Roman" -V fontsize=12pt --number-sections --toc --lof --lot`)
- ✅ Cover letter PDF assembled (`pandoc manuscript/cover_letter_emse_phase1_v1.md -o ~/Desktop/cover_letter_emse_phase1.pdf --pdf-engine=xelatex`)

Paste below into Claude.ai in Chrome (signed into Gmail `suneetmalhotra2002@gmail.com`).

---

```
You are submitting Article 3 Phase 1 to Empirical Software Engineering
(EMSE, Springer) Methodological Articles track on behalf of Suneet
Malhotra. Today is whatever Chrome shows.

# PRE-FLIGHT GATES — verify ALL are TRUE before proceeding

1. Manuscript PDF exists at ~/Desktop/article3_phase1_emse.pdf
2. Cover letter PDF exists at ~/Desktop/cover_letter_emse_phase1.pdf
3. Zenodo DOI is minted and resolvable (verify by visiting
   https://doi.org/10.5281/zenodo.<id> — user will provide the ID)
4. Git tag v0.3.0-phase1-pilot exists on
   github.com/SuneetMalhotra/visual-oracle-bench
5. The 5 verified reviewers from
   manuscript/sections/_suggested_reviewers.md are confirmed
6. Hostile review BLOCKER findings have all been addressed

If ANY gate fails, STOP. Report which gate failed.

# THE SUBMISSION

Portal: https://www.editorialmanager.com/empi/
Verify URL by searching for "Empirical Software Engineering Editorial
Manager 2026" first — Springer occasionally re-paths these.

Article type: Methodological Articles
Fallback: Research Article (if Methodological is absent; in cover letter
already explains the Methodological scope fit)

# WORKFLOW (24 ordered steps)

## Step 1 — Log in / register

Email: suneetmalhotra2002@gmail.com
Prefer ORCID single-sign-on (links 0009-0003-8707-9590 automatically).
If creating new account:
- Country: United States
- State/City: California / Los Angeles
- Institution: Motorola Solutions
- Position: Senior Manager, Test Engineering

## Step 2 — Profile completeness check

Verify the profile shows:
- ORCID 0009-0003-8707-9590 (Fetch button, not manual entry; if showing
  as "unverified yellow badge", re-link via Fetch)
- Email: suneetmalhotra2002@gmail.com
- Country / State / Institution / Position all populated

## Step 3 — Click "Submit New Manuscript"

## Step 4 — Article type

Select: Methodological Articles
Fallback: Research Article (if Methodological is absent)

## Step 5 — Title

Paste:
"Visual Oracle Bench: A Pre-Registered Methodological Pilot for
Multi-Application LLM-as-Judge Visual Regression Detection"

## Step 6 — Abstract (≤250 words)

Read the abstract from the manuscript title block. If it's longer than
250 words, STOP and ask the user to trim.

## Step 7 — Keywords (4-6)

Paste: LLM-as-Judge, software testing, visual regression, empirical
software engineering, pre-registration, reproducibility

## Step 8 — Highlights (3-5; EMSE-required)

Paste the 5 Highlights from the manuscript title block (the section
labeled "Highlights" before the Abstract).

## Step 9 — Authors

Sole author: Suneet Malhotra, ORCID 0009-0003-8707-9590, affiliation
Motorola Solutions (independent research; affiliation for identification
only).

## Step 10 — Manuscript file upload

Select: ~/Desktop/article3_phase1_emse.pdf

## Step 11 — Cover letter

Select: ~/Desktop/cover_letter_emse_phase1.pdf
Or paste content from manuscript/cover_letter_emse_phase1_v1.md if
portal accepts text instead of file.

## Step 12 — Suggested reviewers (5)

Read manuscript/sections/_suggested_reviewers.md. For each of the 5
reviewers, fill:
- Full name
- Institutional email
- Affiliation
- Justification (1-2 sentences from the file)

The 5 reviewers are:
1. Davide Falessi (University of Rome Tor Vergata)
2. Foutse Khomh (Polytechnique Montréal)
3. Massimiliano Di Penta (University of Sannio)
4. Andy Zaidman (TU Delft)
5. Lionel Briand (University of Ottawa / SnT Luxembourg)

## Step 13 — Non-preferred reviewers

Leave blank.

## Step 14 — Conflict of interest

Paste verbatim:
"The author is employed by Motorola Solutions. This work was conducted
as independent research using only public infrastructure; no
proprietary Motorola Solutions code, data, products, or systems are
described, evaluated, or referenced. The author has no financial
interest in any vendor or platform compared in this manuscript."

## Step 15 — Funding

Paste: "This research received no external funding."

## Step 16 — Author contributions

Paste: "Sole author; all conception, implementation, evaluation,
analysis, and manuscript preparation by S.M."

## Step 17 — Data availability statement

Paste, substituting <ZENODO_ID>:
"All artifacts supporting Phase 1 are open-source under MIT (code) and
CC-BY 4.0 (data) at https://github.com/SuneetMalhotra/visual-oracle-bench,
archived at Zenodo with concept DOI 10.5281/zenodo.<ZENODO_ID> at
release tag v0.3.0-phase1-pilot. Single-command offline reproduction:
./scripts/reproduce_paper.sh. Pre-registration at OSF DOI
10.17605/OSF.IO/NKD6J was registered 2026-06-06, prior to any LLM
judgment collection. Full reproducibility manifest at ARTIFACTS.md."

## Step 18 — Ethics

Answer: NO (no human subjects in Phase 1)

## Step 19 — Pre-registration

If asked: YES, OSF DOI 10.17605/OSF.IO/NKD6J, registered 2026-06-06

## Step 20 — Submitted elsewhere

Answer: NO

## Step 21 — Generative-AI disclosure

If asked, paste:
"The same LLM model family evaluated in §4 of the manuscript (Claude
Sonnet 4.5) was also used by the author for copy-editing and figure
rendering during manuscript preparation. The author conceived all
research, performed all analysis, and verified all results. The
methodological use of GenAI is also the object of study in this
manuscript (Claude Sonnet 4.5 is one of the 3 evaluated LLM judges).
No generative-AI system is an author of this work."

## Step 22 — Review summary screen

Verify carefully:
- Title is correct
- Authors lists ONLY Suneet Malhotra
- ORCID linked with verified badge
- Manuscript PDF attached
- Cover letter attached
- Article type = Methodological Articles
- All statements (CoI, Funding, Author contributions, Data Availability,
  Pre-reg, GenAI) populated

## Step 23 — Click "Approve Submission"

The portal may have a different button label (e.g., "Submit Manuscript",
"Final Submit"). Click whichever advances past the review screen.

## Step 24 — Capture acknowledgment

Within 5-10 minutes, an email arrives at suneetmalhotra2002@gmail.com
with subject like "Confirmation of manuscript submission to Empirical
Software Engineering". Take screenshots:

(a) The Editorial Manager submission summary page (shows the assigned
    manuscript ID, typically EMSE-D-26-XXXXX format)
(b) The confirmation email (subject, sender, date, first 200 chars)

Save to:
~/Desktop/EB-1A/02_EVIDENCE_ARCHIVE/I_Scholarly_Articles_criterion_vi/Article_3_Visual_Oracle_Bench/submission/
as:
- emse_submission_acknowledgment_<YYYY-MM-DD>.png
- emse_submission_email_<YYYY-MM-DD>.png

# WHAT TO REPORT BACK

1. Status: SUBMITTED | BLOCKED_AT_GATE_<N> | PARTIAL_<reason>
2. If SUBMITTED: manuscript ID + timestamp + screenshot paths
3. Any portal quirks (CAPTCHAs, MFA prompts, unexpected fields)
4. Any field where you had to make an interpretive call

# DISCIPLINE

- Do NOT submit if any pre-flight gate failed
- Do NOT use a Motorola work email
- Do NOT cite EB-1A, immigration, USCIS, petition framing anywhere
- Do NOT make up reviewer info — read from
  manuscript/sections/_suggested_reviewers.md verbatim
- Do NOT skip the screenshot capture step (Step 24) — petition file
  needs the EM acknowledgment for criterion (vi) evidence
- If portal asks about manuscript page count and the user hasn't
  provided it, STOP and ask
- If anything unclear, STOP and ask the user — better to delay than
  submit wrong
```

---

# Post-submission

After this Chrome prompt completes successfully:
1. Forward the EMSE confirmation email to Akanksha (`akanksha@ingramesq.com`) cc Farhan (`farhan@ingramesq.com`)
2. Update task #127 with status: Article 3 Phase 1 submitted, manuscript ID = EMSE-D-26-XXXXX, awaiting editor assignment
3. Set a calendar reminder for 2026-08-15 to check Editorial Manager status (typical "Under Review" by then)
