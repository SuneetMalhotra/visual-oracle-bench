# Article 3 Submission-Readiness Audit — 2026-06-09

Author: Suneet Malhotra | Repo: `/Users/suneetmalhotra/work/visual-oracle-bench`
Filing target: 2026-10-02 | Target Phase 1 venue: EMSE Methodological Articles / EASE 2027 / AIware 2026

---

## TL;DR

The infrastructure and disclosure framing are in good shape — Phase 1 / Phase 2 split is honestly scoped, OSF pre-registration is locked and cited, MIT/CC-BY licensing is in place, and `sharp` is properly declared after the Llama single-image workaround. The repo is NOT submission-ready as a Phase 1 methodological pilot because (a) the first dispatch run failed on the Llama judge (400/400 malformed; a rerun is in flight as of 15:16 today), (b) there is NO analysis pipeline yet that consumes the `.parquet` output and produces κ / agreement tables, and (c) the README still advertises Phase 1 as "in flight" with a stale PID instead of "Phase 1 complete; results in `results/`". Estimated 1.5-2 working days of focused work to get to a defensible pilot submission, assuming the in-flight Llama rerun finishes cleanly.

## Green (ready to ship)

- `/Users/suneetmalhotra/work/visual-oracle-bench/LICENSE` — MIT, present, well-formed.
- `/Users/suneetmalhotra/work/visual-oracle-bench/LICENSE-DATA` — CC-BY 4.0, present, full canonical text.
- `/Users/suneetmalhotra/work/visual-oracle-bench/CITATION.cff` — valid CFF 1.2.0; ORCID + website populated; OSF DOI cited as `preferred-citation`. (See Yellow #2 re Zenodo.)
- `/Users/suneetmalhotra/work/visual-oracle-bench/.gitignore` — properly excludes secrets, large image corpora, results/logs, node_modules, venv.
- `/Users/suneetmalhotra/work/visual-oracle-bench/package.json` — `sharp ^0.34.5` IS declared in devDependencies (line 31) and resolved in `package-lock.json` (sharp-darwin-arm64 0.34.5). Llama workaround dependency is committed.
- `/Users/suneetmalhotra/work/visual-oracle-bench/preregistration/draft.md` — comprehensive, all §12 lock items resolved (Decisions A-D), OSF DOI 10.17605/OSF.IO/NKD6J registered 2026-06-06 BEFORE first judgment dispatch (W7 first dispatch was 2026-06-06 19:50; registration timestamp predates).
- `/Users/suneetmalhotra/work/visual-oracle-bench/oracles/llm_judge/llama_ollama.ts` — clean implementation; the side-by-side composite workaround for the `llama3.2-vision:11b` single-image limitation is well-commented and uses `sharp` properly. Reachability probe + clear error messages.
- `/Users/suneetmalhotra/work/visual-oracle-bench/manuscript/skeleton.md` — Phase 1 / Phase 2 framing is present, prominent, and honestly scoped. §3.2 and §6.2 both carry explicit Phase 1 disclaimers. No author-prose contamination (per the Eldh no-AI rule).
- `apps/{conduit,mattermost,excalidraw,gitlab-ce,rocket-chat,penpot,cal-com,nocodb}/RUNBOOK.md` — all 8 present; Conduit RUNBOOK is detailed and has the W6 orchestrator contract documented. (See Yellow #5 re placeholder digests in mattermost + penpot.)
- `/Users/suneetmalhotra/work/visual-oracle-bench/tests/` — 12 test files: 3 unit suites (primitives, oracles, llm_judge stubs), 1 offline smoke, 8 per-app smokes. No test file modifications since 2026-06-06; nothing claimed broken.
- Git history is clean — NO Claude/Anthropic co-author trailers in any commit (per global rule).

## Yellow (needs minor update before submission)

1. **`README.md` "Status" section is stale.** It still describes Phase 1 dispatch as "in flight" with `logs/w7_dispatch.pid` running, but that run completed 2026-06-07 02:50 UTC. Needs to be updated to: "Phase 1 dispatch complete 2026-06-07; 800/1200 judgments succeeded (Codex + Claude OAuth); Llama rerun in progress 2026-06-09 after sharp-composite workaround landed." **Est: 15 min.**

2. **`CITATION.cff` does not yet cite a Zenodo DOI.** Acceptable for pre-mint, but if submitting Phase 1 to a venue, mint a Zenodo DOI for the Phase 1 code+data snapshot now and add it as a second `identifiers:` entry. README §"Reproducibility commitments" line 100 says "DOI minted at submission" — that needs to actually happen pre-submission. **Est: 30 min** (Zenodo upload + CFF update + README update).

3. **README has no link to companion work (JSSOFTWARE-D-26-01260 or Specification Enrichment paper).** Only mentions antecedent `agent-harness` v1.2.0 (line 11). For a coherent EB-1A petition narrative the README should cross-link the companion JSS submission ID and the Specification Enrichment paper — reviewers and grant assessors will be looking for the program of research. **Est: 15 min.**

4. **`scripts/reproduce_paper.sh` README block (lines 67-72) references 6 LLM judges** ("6 LLM judges (gpt4o, claude, claude-oauth, openai-codex, gemini, llama)") but the actual Phase 1 dispatch ran 3 (`openai-codex,claude-oauth,llama`) per W7 metadata. Either reword to "all 6 wrappers exist; default dispatch uses 3 subscription-path judges" or align to the actual Phase 1 default. **Est: 10 min.**

5. **Stale placeholder digests in Mattermost + Penpot docker-compose.yml** flagged in their own RUNBOOKs (mattermost/RUNBOOK.md:70, penpot/RUNBOOK.md:76). These are explicitly Phase 2 blockers — fine to leave for Phase 1 pilot submission, but flag in the manuscript Limitations. **Est: 0 min for Phase 1; 30 min per app for Phase 2.**

6. **`results/judgments_metadata.json` has been overwritten** by the in-flight Llama rerun (it now only lists `judges: [{ name: llama }]`). The original W7 run's metadata (which listed openai-codex + claude-oauth + llama) is lost. The dispatcher should append-or-version metadata, not overwrite. For pilot submission, reconstruct the original metadata from the log file `logs/w7_dispatch_20260606_195009.log` and pin it. **Est: 30 min.**

7. **`analysis/results/` is empty** and `analysis/source-analysis-kappa.py` is the antecedent's analysis script ported verbatim (it scores `accepted-as-is / minor-edit / major-rework` verdicts — Article-2-style, NOT the binary defect_present verdict that Article 3 uses). It will need to be rewritten or replaced before any κ can be reported. (See Red #1.)

8. **No `ARTIFACTS.md` / reproducibility manifest** exists at repo root. EMSE Methodological Articles track typically requires one. **Est: 1 hour** to write a one-pager.

## Red (BLOCKER — must fix before submission)

1. **NO ANALYSIS PIPELINE EXISTS that consumes the Phase 1 results.** `analysis/` contains only `source-analysis-kappa.py` (copied from antecedent agent-harness, scores 3-class manuscript-review verdicts, NOT applicable to binary visual-defect verdicts) and an empty `results/` subdir. The Phase 1 parquet sits at `results/judgments_2026-06-07T02-50-09-790Z.parquet` (609 KB, 1200 rows, 400 of which are malformed Llama responses awaiting the rerun) with no script to read it, compute per-judge κ vs ground truth, or produce the descriptive tables the manuscript §4 needs. **Severity:** can't write a pilot paper without ANY numbers, and "we ran 1200 judgments and didn't analyze them" is not a submission. **Est: 6-10 hours** to write `analysis/score_judgments.py` (parquet load, ground-truth join, pairwise Cohen's κ matrix, inter-LLM agreement, malformed-rate table, save .csv/.md report into `analysis/results/`).

2. **No ground-truth labels exist for the Phase 1 synthetic-HTML corpus.** The pre-reg §4.6 ground-truth protocol talks about author-coding the live-app screenshots; for Phase 1 synthetic-HTML, the ground truth is trivially known (it was generated programmatically by the injection primitives — every "defect" image IS a defect by construction, every "baseline" IS clean). The pairs manifest at `data/images/_pairs_manifest.json` should expose this as a `ground_truth: defect_present|clean` column so the analysis pipeline can compute agreement. Verify: open the manifest and check it has the field. If not present, **Est: 1 hour** to backfill from the per-app `_capture_ledger.json` files.

3. **Llama Phase 1 rerun is still in flight** (PID 53713 alive as of audit time, log file last touched 15:16 with only ~5 lines of progress). 400 pairs × Llama vision at ~30-60s/call ≈ 3-6 hours wall clock. Until it finishes successfully (or fails again), Phase 1 has only 2 of 3 judges' data, which kills any inter-LLM agreement analysis (H4 in pre-reg). **Severity:** the entire pilot value-add is "we got a 3-judge agreement matrix on 400 pairs" — without Llama, it's a 2-judge matrix and the inter-rater story shrinks dramatically. **Est: 0 hours active work** (just wait), but **add 30 min to validate the output parquet** (malformed_final should be near 0 this run; if it's still 400, the sharp workaround didn't fix it and you have a code bug, not just a wait).

4. **Manuscript skeleton §1 INTRODUCTION still lists three contributions that overclaim Phase 2 results** (line 64-67): "(2) the empirical answer to RQ1 (does κ generalize)" — that answer requires Phase 2 live-Docker data, which doesn't exist. For a Phase 1 pilot submission, contribution (2) must be rewritten as something like "an end-to-end engineering validation of the harness at 1,200-judgment scale, surfacing per-judge malformed-rate patterns and the Llama-vision single-image constraint as a methodological finding." **Severity:** an EMSE reviewer who reads "empirical answer to RQ1" and then sees only synthetic-HTML results will reject for misalignment. **Est: 1 hour** to rewrite §1 contributions + §4 Results outline + §5 Discussion bullets to be Phase-1-honest.

## Specific findings by audit item

### 1. Does `package.json` declare `sharp`?
YES. `package.json` line 31: `"sharp": "^0.34.5"`. Confirmed in `package-lock.json` (resolved as `@img/sharp-darwin-arm64` 0.34.5). The llama_ollama.ts `import sharp from 'sharp'` will resolve.

### 2. Does `CITATION.cff` exist and cite the correct Zenodo DOI?
EXISTS, well-formed, cites the OSF pre-reg DOI (10.17605/OSF.IO/NKD6J). Does NOT cite a Zenodo DOI — no Zenodo deposit has been minted yet. README line 100 commits to minting at submission. For Phase 1 pilot submission, mint now and add to CFF. (Yellow #2.)

### 3. Is `manuscript/skeleton.md` already structured with Phase 1 / Phase 2 framing?
YES — added in the 2026-06-06 commit `2d84c66`. The reporting-structure block (lines 12-16) is prominent and honest. §3.2 has a 1-paragraph Phase 1 disclosure (line 104). §6.2 has a Phase 1 external-validity boundary paragraph (line 205). What's MISSING: the §1 INTRODUCTION contributions block (lines 64-67) and the §4 Results section still describe the Phase 2 deliverable as if it were the paper's deliverable. Needs Phase-1-honest rewrite. (Red #4.)

### 4. Does `scripts/reproduce_paper.sh` work end-to-end?
For the OFFLINE pipeline as claimed: cannot execute in audit context, but the script is internally consistent — runs npm install, playwright install chromium, three unit suites (test:primitives, test:oracles, test:llm_judges), and the offline 12-PNG smoke. All four targets exist in `package.json` scripts and as real files in `tests/`. Last touched 2026-06-06; nothing in the diff history suggests breakage. The line 70 reference to "6 LLM judges" is mildly stale (Yellow #4). For Phase 2 / real-Docker capture: NOT runnable on this machine (Docker not installed per Conduit RUNBOOK line 67). Phase 1 pilot submission only depends on the offline-suite claim, which is defensible.

### 5. Are the unit tests up to date? Any failing?
Inventory: 3 unit test files (`test_primitives_unit.ts`, `test_oracles_unit.ts`, `test_llm_judge_stubs.ts`) + 1 offline smoke (`smoke_offline_pipeline.ts`) + 8 per-app smokes (one per app). All last touched 2026-06-06. The reproduce script claims they all pass; no run was performed in this audit. `test_oracles_unit.ts` correctly documents that the offline `zorder` case has SSIM=1.0 (a faithful negative for pixel oracles — this is a feature, not a bug). NO test exists yet for the new sharp-composite path in `llama_ollama.ts` — only `smoke_llama_fix.ts` (a one-pair manual smoke) covers it. A unit test asserting the composite is 2x width + 28px label band should be added before pilot submission. **Est: 45 min.**

### 6. Does README mention JSSOFTWARE-D-26-01260 / Specification Enrichment companion?
NO. README only references the antecedent `agent-harness` v1.2.0 (line 11). No JSSOFTWARE ID, no Specification Enrichment paper link, no broader research-program framing. (Yellow #3.)

### 7. Stale TODOs / FIXME / XXX / HACK?
Grep returned only 3 hits, all benign:
- `apps/cal-com/seed.sh:112` — `mktemp -t calcom-cookies.XXXXXX` (mktemp template, not a code TODO).
- `apps/penpot/RUNBOOK.md:76` — explicit "tracked here rather than in code TODOs" placeholder-digest note (Phase 2 blocker, intentional).
- `apps/mattermost/RUNBOOK.md:70` — same placeholder-digest note.

NO embarrassing TODO/FIXME/HACK markers in code. The two RUNBOOK notes are forthright disclosure of Phase 2 unfinished work, NOT submission-blockers for Phase 1.

### 8. Does `analysis/` have a runnable analysis pipeline?
NO. `analysis/` contains exactly one file: `source-analysis-kappa.py`, which is the antecedent's analysis script for a 3-class manuscript-review verdict scheme (`accepted-as-is / minor-edit / major-rework`) — it does NOT match the binary `defect_present` verdict shape that the Phase 1 dispatcher emits. `analysis/results/` is empty. There is no `.py` or `.r` or `.ipynb` that reads `results/judgments_*.parquet` and produces κ tables. (Red #1.)

### 9. Is the manuscript contribution scope honest about Phase 1?
PARTIALLY. The reporting-structure preamble (lines 12-16) is admirably honest and prominent. §3.2 and §6.2 carry Phase 1 disclaimers. BUT the §1 INTRODUCTION contribution list (lines 64-67) and the §4 Results outline (lines 130-162) still read as if the Phase 2 cross-app generalization data exists. A reviewer who skims (which is what reviewers do) will read those sections and feel misled when the Results actually report synthetic-HTML. The Phase 1 / Phase 2 framing needs to be REPEATED in §1 contributions and §4 opener, not just declared once at the top. (Red #4.)

---

## Recommended pre-submission task list

Ordered by dependency, with effort estimates. Total: ~14-18 hours of focused work. Achievable in 2 working days if the Llama rerun finishes cleanly tonight.

1. **Validate Llama rerun output when it finishes** (30 min). Check `results/judgments_<new-timestamp>.parquet` has malformed_final near 0, not 400. If still 400, the sharp workaround is broken — DIAGNOSE before doing anything else. Blocks everything downstream.

2. **Reconstruct full W7 judgments_metadata.json** (30 min). The Llama rerun overwrote it. Pull the original 3-judge metadata block from `logs/w7_dispatch_20260606_195009.log` and write a versioned `judgments_metadata_2026-06-07.json` alongside the new Llama-only one. Pin the dispatcher to append-version going forward.

3. **Backfill ground-truth column into pairs manifest** (1 hour). Add `ground_truth: "defect"|"clean"` to each entry in `data/images/_pairs_manifest.json` (defects are by-construction). Source from per-app `_capture_ledger.json` files. This unblocks any analysis pipeline.

4. **Write `analysis/score_phase1.py`** (6 hours). Loads `judgments_*.parquet` (both runs), joins to ground truth from the pairs manifest, computes: (a) per-judge accuracy + Cohen's κ vs ground truth with bootstrap CIs; (b) pairwise inter-LLM Cohen's κ matrix (3x3); (c) per-defect-category breakdown; (d) malformed-rate table; (e) per-app(synthetic) breakdown for completeness. Output: `analysis/results/phase1_summary.md` + `.csv`. Use the random seeds pre-registered in §11 (20260619-20260623) for any sampling.

5. **Run the analysis pipeline + commit results** (30 min).

6. **Rewrite manuscript §1 contributions to be Phase-1-honest** (1 hour). Three contributions become: (a) the public benchmark + harness (unchanged), (b) the engineering-validation pilot finding (1,200-judgment scale, sharp-composite workaround, malformed-rate findings — this IS a methodological contribution worth EMSE-Methods or AIware), (c) the pre-registered protocol itself as a reusable template. RQ1/RQ2 framing moves to "Phase 2 future work, OSF-registered".

7. **Rewrite manuscript §4 Results opener** (30 min) to lead with "Phase 1 reports engineering-validation data on the synthetic-HTML corpus. The pre-registered RQ1-RQ4 confirmatory analyses are deferred to Phase 2 (live-Docker capture, pending)." Then populate the 4-LLM x 8-app and McNemar tables WITH PHASE 1 NUMBERS clearly labeled as synthetic.

8. **Update README "Status" section** (15 min). Drop the stale "in flight" PID. Add: "Phase 1 dispatch complete YYYY-MM-DD; analysis pipeline at `analysis/score_phase1.py`; results in `analysis/results/phase1_summary.md`. Phase 2 (live-Docker) pending Dockerfile debug across mattermost + penpot."

9. **Add JSS companion + Specification Enrichment cross-links to README** (15 min). One paragraph under a new "Companion work" heading: antecedent (agent-harness v1.2.0, κ=0.667 baseline), JSS submission ID JSSOFTWARE-D-26-01260, Specification Enrichment paper [DOI/preprint URL].

10. **Mint Zenodo DOI for Phase 1 code+data snapshot, update CFF + README** (45 min). Tag the repo as `v0.3.0-phase1-pilot`, upload to Zenodo, capture the DOI, add to `CITATION.cff` identifiers, replace the "[minted W16 at submission]" placeholder in README and manuscript skeleton.

11. **Write `ARTIFACTS.md` at repo root** (1 hour). One page: what's in the repo, what's in the Zenodo deposit, how to reproduce the offline suite + how Phase 1 results were generated, which files map to which manuscript section. EMSE Methodological Articles reviewers expect this.

12. **Add unit test for `LlamaOllamaJudge.compositeBaselineAndDefect`** (45 min). Assert composite is `2W + 4px divider` wide, `28px + max(H1,H2)` tall, label band has the right colors, returns valid base64 PNG. Pure pixel-math test, no Ollama needed.

13. **Update `scripts/reproduce_paper.sh` postscript** (10 min) — fix the "6 LLM judges" claim to match the actual 3-judge default dispatch.

14. **Final pass: re-grep for TODO/FIXME/XXX and re-read the manuscript skeleton end-to-end with Phase 1 framing in mind** (1 hour). Anything that still reads as "Phase 2 will show…" in the past/present tense needs to become "Phase 2 is designed to show…".

15. **Internal review pass against the audit's Red items** (30 min). Confirm Red #1 (analysis pipeline) → resolved by item 4. Red #2 (ground truth) → resolved by item 3. Red #3 (Llama rerun) → resolved by item 1. Red #4 (overclaim) → resolved by items 6+7. Only then submit.

---

**Verdict for the impatient:** NEEDS WORK. Phase 1 pilot is achievable for a fast-turnaround venue (EMSE Methodological Articles, EASE 2027, AIware 2026) before the 2026-10-02 EB-1A filing deadline, but the analysis pipeline is the binding constraint — you cannot ship "we collected 1,200 judgments and didn't compute κ on any of them."
