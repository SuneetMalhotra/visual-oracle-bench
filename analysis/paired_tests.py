#!/usr/bin/env python3
"""Paired inferential tests for the v1.6 manuscript (§4 / §6 conclusion validity).

Computes exact McNemar tests (binomial, two-sided, on discordant pairs) for
Claude vs Codex verdict correctness on the both-judges-clean intersection,
overall (defect and control subsets) and per defect category, with Holm
correction across the per-category tests.

Reuses the loading + silent-fabrication filter from analyze_judgments.py so
the row-inclusion rule is identical to the primary analysis. Run:

    .venv-analysis/bin/python3 analysis/paired_tests.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from scipy.stats import binomtest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import analyze_judgments as aj  # noqa: E402

REPO = Path(__file__).resolve().parent.parent


def main() -> None:
    parquets = aj.discover_parquets(REPO / "results")
    merged, _ = aj.select_latest_per_judge(parquets)
    manifest = aj.load_manifest(REPO / "data" / "images" / "_pairs_manifest_v2.json")
    joined, _ = aj.join_judgments_to_manifest(merged, manifest)

    valid = joined[joined.apply(aj.is_valid_verdict, axis=1)].copy()
    valid["correct"] = valid["verdict"] == valid["ground_truth"]
    valid["pair_id"] = valid["baselinePath"] + "||" + valid["defectPath"]

    cla = valid[valid.judgeName == "claude-oauth"].set_index("pair_id")
    cdx = valid[valid.judgeName == "openai-codex"].set_index("pair_id")
    both = cla[["correct", "ground_truth", "category"]].join(
        cdx[["correct"]], lsuffix="_cla", rsuffix="_cdx", how="inner"
    )

    def mcnemar(sub) -> dict:
        b = int((sub.correct_cla & ~sub.correct_cdx).sum())   # Claude-only correct
        c = int((~sub.correct_cla & sub.correct_cdx).sum())   # Codex-only correct
        n_disc = b + c
        p = binomtest(min(b, c), n_disc, 0.5).pvalue if n_disc > 0 else float("nan")
        return {"n": int(len(sub)), "claude_only_correct": b,
                "codex_only_correct": c, "n_discordant": n_disc, "p_exact": p}

    out: dict = {
        "note": ("Exact McNemar (two-sided binomial on discordant pairs), "
                 "computed on the intersection of pairs where BOTH judges have "
                 "a clean (non-silent-fab, non-malformed) verdict."),
        "overall_defect_subset": mcnemar(both[both.ground_truth == "fail"]),
        "overall_control_subset": mcnemar(both[both.ground_truth == "pass"]),
    }

    defects = both[both.ground_truth == "fail"]
    per_cat = {c: mcnemar(defects[defects.category == c])
               for c in sorted(defects.category.unique())}

    # Holm step-down across per-category tests (NaN p-values excluded).
    testable = [(c, r) for c, r in per_cat.items() if r["p_exact"] == r["p_exact"]]
    testable.sort(key=lambda kv: kv[1]["p_exact"])
    m = len(testable)
    running_max = 0.0
    for i, (cat, r) in enumerate(testable):
        adj = min(1.0, (m - i) * r["p_exact"])
        running_max = max(running_max, adj)
        r["p_holm"] = running_max
    out["per_category_defects"] = per_cat
    out["n_holm_tests"] = m

    print(json.dumps(out, indent=2))
    dest = REPO / "analysis" / "results" / "paired_tests_latest.json"
    dest.write_text(json.dumps(out, indent=2))
    print(f"Wrote {dest}")


if __name__ == "__main__":
    main()
