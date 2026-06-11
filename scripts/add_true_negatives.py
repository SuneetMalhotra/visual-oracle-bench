#!/usr/bin/env python3
"""
Extend the 400-pair defect manifest with 200 true-negative control pairs
so the Phase 1 analysis can report precision / specificity / F1 / MCC.

Addresses EMSE reviewer BLOCKER 2 (2026-06-10 cross-AI review): the
original 400-pair corpus has zero true-negative cases. Precision,
specificity, false-positive rate, balanced accuracy, and MCC are all
undefined when ground truth is 100% positive. An oracle benchmark that
only measures sensitivity is not an oracle benchmark.

Design: 25 control pairs per app x 8 apps = 200 controls. Each control
pair sets baseline == defect (identical PNG path), so the ground-truth
expected verdict is 'pass' (no change between images). A judge that
emits 'fail' on a control pair is a false positive; the rate at which
this happens is specificity.

Existing 400 defect pairs are tagged expected_verdict='fail' (made
explicit; previously implicit).

Stratification: controls are picked by striding through each app's
50 existing defect pairs (every other one, first 25), which spans the
6 defect-category surfaces uniformly.

Output: data/images/_pairs_manifest_v2.json (600 pairs total).
"""
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
SRC = REPO / "data" / "images" / "_pairs_manifest.json"
DST = REPO / "data" / "images" / "_pairs_manifest_v2.json"
N_CONTROL_PER_APP = 25  # 25 x 8 apps = 200 controls


def main() -> None:
    with SRC.open() as f:
        m = json.load(f)

    # Tag every existing pair (all defects) explicitly.
    for pair in m["results"]:
        pair["expected_verdict"] = "fail"

    # Group by app to stratify-sample 25 baselines per app.
    by_app: dict[str, list[dict]] = {}
    for pair in m["results"]:
        by_app.setdefault(pair["app"], []).append(pair)

    new_pairs: list[dict] = []
    for app in sorted(by_app):
        pairs = sorted(by_app[app], key=lambda p: p["defect_id"])
        # Stride across the 50-pair list so we span all 6 categories.
        sample = pairs[::2][:N_CONTROL_PER_APP]
        if len(sample) < N_CONTROL_PER_APP:
            raise RuntimeError(
                f"{app}: only {len(sample)} candidate baselines available, "
                f"need {N_CONTROL_PER_APP}"
            )
        for i, src in enumerate(sample, start=1):
            ctrl_id = f"{app}-control-{i:03d}"
            new_pairs.append(
                {
                    "app": app,
                    "defect_id": ctrl_id,
                    "category": "control",
                    "surface": src["surface"],
                    "baseline": src["baseline"],
                    "defect": src["baseline"],  # identical -> true negative
                    "expected_verdict": "pass",
                    "source_baseline_of": src["defect_id"],
                }
            )

    m["results"] = m["results"] + new_pairs
    m["total_pairs"] = len(m["results"])
    m["version"] = 2
    m["v2_generated_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    m["v2_control_pairs_added"] = len(new_pairs)
    m["v2_change_rationale"] = (
        "Added 200 true-negative control pairs (25 per app) where "
        "baseline == defect to enable precision / specificity / F1 / MCC "
        "reporting. Addresses 2026-06-10 hostile-review BLOCKER 2."
    )
    m["per_app"] = [
        {
            **a,
            "control": N_CONTROL_PER_APP,
            "total": a["included"] + N_CONTROL_PER_APP,
        }
        for a in m["per_app"]
    ]

    with DST.open("w") as f:
        json.dump(m, f, indent=2)

    counts = Counter(p["expected_verdict"] for p in m["results"])
    cats = Counter(p["category"] for p in m["results"])
    print(f"Wrote {DST}")
    print(f"Total pairs: {m['total_pairs']}")
    print(f"  expected_verdict=fail (defects):  {counts['fail']}")
    print(f"  expected_verdict=pass (controls): {counts['pass']}")
    print(f"Per-category counts: {dict(cats)}")
    print(f"Per-app control counts:")
    for app, n in sorted(Counter(p["app"] for p in new_pairs).items()):
        print(f"  {app}: {n}")


if __name__ == "__main__":
    main()
