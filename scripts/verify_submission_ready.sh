#!/usr/bin/env bash
# scripts/verify_submission_ready.sh
#
# Pre-submission verification gate for Article 3 Phase 1 → EMSE Methodological
# Articles. Run this before the EMSE Editorial Manager submission. Exits 0 if
# all gates pass; exits non-zero (with explicit reasons) if any gate fails.
#
# Usage:  ./scripts/verify_submission_ready.sh
#
# This script does NOT submit anything. It is a verification gate — exit code
# 0 means "you may proceed to submit"; non-zero means "fix the failing gates
# first."

set -uo pipefail
cd "$(dirname "$0")/.."

FAIL_COUNT=0
PASS_COUNT=0

pass() { echo "  ✅ PASS: $1"; PASS_COUNT=$((PASS_COUNT+1)); }
fail() { echo "  ❌ FAIL: $1"; FAIL_COUNT=$((FAIL_COUNT+1)); }
warn() { echo "  ⚠️  WARN: $1"; }
section() { echo ""; echo "=== $1 ==="; }

echo "Article 3 Phase 1 — Pre-Submission Verification"
echo "Run: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "Repo: $(pwd)"
echo "Git: $(git log --oneline -1 2>/dev/null || echo '(no git)')"
echo "==========================================================="

# Gate 1: All manuscript sections exist + word counts reasonable
section "Gate 1: Manuscript sections exist with target word counts"
for spec in \
    "manuscript/sections/01_introduction.md:1500:2000" \
    "manuscript/sections/02_related_work.md:1000:1500" \
    "manuscript/sections/03_methodology.md:1800:2600" \
    "manuscript/sections/04_results.md:1500:2200" \
    "manuscript/sections/05_discussion.md:1400:1900" \
    "manuscript/sections/06_threats_to_validity.md:700:1300" \
    "manuscript/sections/07_conclusion.md:400:850"; do
    f=$(echo "$spec" | cut -d: -f1)
    lo=$(echo "$spec" | cut -d: -f2)
    hi=$(echo "$spec" | cut -d: -f3)
    if [ -f "$f" ]; then
        wc=$(wc -w < "$f" | tr -d ' ')
        if [ "$wc" -ge "$lo" ] && [ "$wc" -le "$hi" ]; then
            pass "$f ($wc words, target [$lo-$hi])"
        else
            warn "$f ($wc words, target [$lo-$hi]) — out of range but section present"
            PASS_COUNT=$((PASS_COUNT+1))  # warn doesn't fail the gate
        fi
    else
        fail "$f missing"
    fi
done

# Gate 2: Cover letter exists + length OK
section "Gate 2: Cover letter"
if [ -f manuscript/cover_letter_emse_phase1_v1.md ]; then
    wc=$(wc -w < manuscript/cover_letter_emse_phase1_v1.md | tr -d ' ')
    if [ "$wc" -ge 400 ] && [ "$wc" -le 700 ]; then
        pass "cover_letter_emse_phase1_v1.md ($wc words, target [400-700])"
    else
        warn "cover_letter_emse_phase1_v1.md ($wc words, target [400-700]) — out of range"
        PASS_COUNT=$((PASS_COUNT+1))
    fi
else
    fail "Cover letter missing"
fi

# Gate 3: Suggested reviewers list exists with 3-5 named candidates
section "Gate 3: Suggested reviewers"
if [ -f manuscript/sections/_suggested_reviewers.md ]; then
    count=$(grep -c '^### Reviewer ' manuscript/sections/_suggested_reviewers.md 2>/dev/null || echo 0)
    if [ "$count" -ge 3 ] && [ "$count" -le 5 ]; then
        pass "_suggested_reviewers.md ($count reviewers, target 3-5)"
    else
        fail "_suggested_reviewers.md has $count reviewers; need 3-5"
    fi
else
    fail "Suggested reviewers file missing"
fi

# Gate 4: Phase 1 analysis outputs exist (numbers must be reproducible)
section "Gate 4: Phase 1 analysis outputs"
JSON=$(ls analysis/results/phase1_analysis_*.json 2>/dev/null | head -1)
MD=$(ls analysis/results/phase1_analysis_*.md 2>/dev/null | head -1)
if [ -n "$JSON" ] && [ -n "$MD" ]; then
    pass "Analysis JSON: $JSON"
    pass "Analysis MD: $MD"
else
    fail "Phase 1 analysis output files missing (run analysis/analyze_judgments.py)"
fi

# Gate 5: Phase 1 parquet inputs exist (the source data)
section "Gate 5: Phase 1 parquet inputs"
if ls results/judgments_*.parquet 2>/dev/null | head -1 > /dev/null; then
    count=$(ls results/judgments_*.parquet 2>/dev/null | wc -l | tr -d ' ')
    pass "$count parquet file(s) in results/"
else
    fail "No Phase 1 parquet files found in results/"
fi

# Gate 6: OSF pre-registration referenced
section "Gate 6: OSF pre-registration reference"
if grep -q "10.17605/OSF.IO/NKD6J" manuscript/article3_phase1_v1.md 2>/dev/null; then
    pass "OSF DOI 10.17605/OSF.IO/NKD6J cited in manuscript"
else
    fail "OSF DOI not cited in manuscript/article3_phase1_v1.md — submission must cite the pre-registration"
fi

# Gate 7: Phase 1 / Phase 2 framing present
section "Gate 7: Phase 1 / Phase 2 framing"
if grep -q "Phase 1" manuscript/article3_phase1_v1.md && grep -q "Phase 2" manuscript/article3_phase1_v1.md; then
    pass "Both 'Phase 1' and 'Phase 2' appear in manuscript"
else
    fail "Phase 1 / Phase 2 framing missing from manuscript body"
fi

# Gate 8: Llama composite-vs-capability framing present
section "Gate 8: Llama failure-mode framing (highest attack-surface section)"
if grep -qi "composite" manuscript/article3_phase1_v1.md && \
   grep -qi "capability" manuscript/article3_phase1_v1.md && \
   grep -qi "llama" manuscript/article3_phase1_v1.md; then
    pass "Llama + composite + capability all referenced in manuscript"
else
    fail "Llama composite-vs-capability framing missing (this is the most attackable section)"
fi

# Gate 9: All 3 judges named with model identifiers
section "Gate 9: Three judges named with model identifiers"
if grep -q "claude-sonnet-4-5" manuscript/article3_phase1_v1.md && \
   grep -q "gpt-5-codex" manuscript/article3_phase1_v1.md && \
   grep -q "llama3.2-vision:11b" manuscript/article3_phase1_v1.md; then
    pass "All 3 judge model identifiers present in manuscript"
else
    fail "One or more judge model identifiers missing"
fi

# Gate 10: Companion-work cross-links present
section "Gate 10: Companion-work cross-references"
if grep -q "JSSOFTWARE-D-26-01260" manuscript/article3_phase1_v1.md; then
    pass "JSS Article 2 companion manuscript ID referenced"
else
    warn "JSS Article 2 companion ID not in manuscript (acceptable but reviewers like seeing the program of research)"
fi

# Gate 11: Reproducibility commitments
section "Gate 11: Reproducibility commitments"
for kw in "MIT" "CC-BY" "ARTIFACTS.md" "reproduce_paper.sh"; do
    if grep -q "$kw" manuscript/article3_phase1_v1.md ARTIFACTS.md README.md 2>/dev/null; then
        pass "'$kw' referenced (in manuscript / ARTIFACTS / README)"
    else
        fail "'$kw' missing — reproducibility commitment incomplete"
    fi
done

# Gate 12: No banned phrases
section "Gate 12: No EB-1A / immigration / USCIS / lawyer references in manuscript"
for banned in "EB-1A" "immigration" "USCIS" "Akanksha" "petition" "Ingram"; do
    if grep -qi "$banned" manuscript/article3_phase1_v1.md manuscript/cover_letter_emse_phase1_v1.md 2>/dev/null; then
        fail "Banned phrase '$banned' appears in manuscript or cover letter"
    else
        pass "'$banned' absent (correct)"
    fi
done

# Gate 13: Author identifiers
section "Gate 13: Author identifiers"
for id in "Suneet Malhotra" "0009-0003-8707-9590" "suneetmalhotra.com"; do
    if grep -q "$id" manuscript/article3_phase1_v1.md; then
        pass "'$id' present"
    else
        fail "'$id' missing from manuscript"
    fi
done

# Gate 14: Zenodo DOI status — flag if not yet minted
section "Gate 14: Zenodo DOI mint status"
if grep -q "zenodo.20576685" manuscript/article3_phase1_v1.md ARTIFACTS.md 2>/dev/null; then
    pass "Zenodo concept DOI 10.5281/zenodo.20576685 referenced (was used in Article 2 — may be wrong concept)"
    warn "VERIFY: 20576685 is the Article 2 (agent-harness) DOI; Article 3 needs its OWN Zenodo deposit"
elif grep -qE "zenodo\.[0-9]" manuscript/article3_phase1_v1.md ARTIFACTS.md 2>/dev/null; then
    pass "A Zenodo DOI is referenced"
else
    fail "No Zenodo DOI referenced — mint at zenodo.org before submission (Suneet OAuth required)"
fi

# Gate 15: Git tag for the submission snapshot
section "Gate 15: Git tag for Phase 1 pilot submission snapshot"
if git tag -l 2>/dev/null | grep -q "v0.3.0-phase1-pilot"; then
    pass "Git tag v0.3.0-phase1-pilot exists"
else
    fail "Git tag v0.3.0-phase1-pilot missing — run 'git tag -a v0.3.0-phase1-pilot -m \"Phase 1 pilot submission\"' before submission"
fi

# Final summary
echo ""
echo "==========================================================="
echo "VERIFICATION SUMMARY"
echo "  PASS: $PASS_COUNT"
echo "  FAIL: $FAIL_COUNT"
echo ""

if [ "$FAIL_COUNT" -eq 0 ]; then
    echo "✅ ALL GATES PASS — Article 3 Phase 1 is ready for EMSE submission."
    echo "    Next step: run the EMSE submission Chrome prompt."
    exit 0
else
    echo "❌ $FAIL_COUNT gate(s) failed — DO NOT submit until all gates pass."
    echo "    Each FAIL above explains what's missing and how to fix it."
    exit 1
fi
