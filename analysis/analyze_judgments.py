#!/usr/bin/env python3
"""
analyze_judgments.py — W8 Phase 1 analysis for Visual Oracle Bench.

Reads every `results/judgments_*.parquet` in the repo and produces a
machine-readable JSON plus a human-readable Markdown report covering:

    * Per-judge accuracy / recall vs. ground truth
    * Pairwise Cohen's kappa (with bootstrap 95% CIs)
    * Fleiss' kappa across all judges (with bootstrap 95% CI)
    * Per-app and per-category accuracy breakdowns
    * Latency (mean / median / p95) and cost (sum / mean) per judge
    * Malformed and retried counts per judge

GROUND-TRUTH ASSUMPTION
-----------------------
The pair manifest at `data/images/_pairs_manifest.json` is constructed so that
every entry pairs a clean baseline screenshot with a defect-injected variant.
By construction the ground-truth verdict for *every* pair is `'fail'`
(regression should be detected). Consequently:

    accuracy_j = P(verdict_j == 'fail' | pair in manifest)
    recall_j   = same thing (every pair is a positive)
    precision  = UNDEFINED (no true negatives in the corpus)

We report precision as `null` in the JSON and `n/a` in the Markdown rather than
fabricating a number. A future phase that mixes baseline-vs-baseline pairs into
the corpus would be required to estimate precision and specificity.

RE-RUN HANDLING
---------------
Phase 1's Llama dispatcher returned 100% malformed JSON the first time around
(2026-06-07). The dispatcher is being re-run; it will write a *new* parquet
`results/judgments_<later-timestamp>.parquet`. This script auto-discovers all
parquets, parses the ISO-8601 timestamp embedded in the filename, and for each
`judgeName` keeps **only the row group from the latest-timestamped parquet that
contains that judge**. The broken Llama parquet from 06-07 is therefore
silently superseded once the new one lands. If no parquet yet contains rows
for a given judge, that judge is omitted from the report and the omission is
called out explicitly under "Data inputs".

USAGE
-----
    .venv-analysis/bin/python3 analysis/analyze_judgments.py
    .venv-analysis/bin/python3 analysis/analyze_judgments.py --dry-run
    .venv-analysis/bin/python3 analysis/analyze_judgments.py --seed 123

OUTPUTS
-------
    analysis/results/phase1_analysis_<ts>.json
    analysis/results/phase1_analysis_<ts>.md

DEPENDENCIES
------------
pyarrow, pandas, numpy + Python stdlib. No scikit-learn (Cohen's and Fleiss'
kappa are implemented in-file per Cohen (1960) / Fleiss (1971)).
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

import numpy as np
import pandas as pd
import pyarrow.parquet as pq


REPO_ROOT = Path(__file__).resolve().parent.parent
RESULTS_DIR = REPO_ROOT / "results"
OUTPUT_DIR = REPO_ROOT / "analysis" / "results"
_MANIFEST_V2 = REPO_ROOT / "data" / "images" / "_pairs_manifest_v2.json"
_MANIFEST_V1 = REPO_ROOT / "data" / "images" / "_pairs_manifest.json"
# v2 (2026-06-10) adds 200 true-negative control pairs + per-pair
# expected_verdict; prefer it when available so precision / specificity /
# F1 / MCC can be reported. v1 falls back if v2 is absent.
MANIFEST_PATH = _MANIFEST_V2 if _MANIFEST_V2.exists() else _MANIFEST_V1

PARQUET_GLOB = "judgments_*.parquet"
# Filename embeds the dispatcher start timestamp in this format:
#   judgments_2026-06-07T02-50-09-790Z.parquet
TIMESTAMP_RE = re.compile(
    r"judgments_(?P<ts>\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)\.parquet$"
)

VERDICT_CATEGORIES = ["fail", "pass"]  # binary verdict universe
# Judges excluded from the "comparable" cross-judge analysis because their
# input modality differs from the others (Llama 3.2 Vision was fed a
# side-by-side composite as a multi-image workaround). Per the
# 2026-06-10 hostile-review BLOCKER 3 fix, Llama is reported in the
# integration-failure-mode appendix but NOT in headline kappa / Fleiss.
LLAMA_JUDGE_NAMES = {"llama", "llama_ollama", "llama-ollama", "llama-vision"}


# ---------------------------------------------------------------------------
# Parquet discovery
# ---------------------------------------------------------------------------

def _parse_filename_timestamp(path: Path) -> Optional[datetime]:
    m = TIMESTAMP_RE.search(path.name)
    if not m:
        return None
    raw = m.group("ts")
    # Convert "2026-06-07T02-50-09-790Z" -> "2026-06-07T02:50:09.790+00:00"
    date, time = raw.split("T", 1)
    parts = time.rstrip("Z").split("-")
    if len(parts) != 4:
        return None
    h, mn, s, ms = parts
    iso = f"{date}T{h}:{mn}:{s}.{ms}+00:00"
    try:
        return datetime.fromisoformat(iso)
    except ValueError:
        return None


def discover_parquets(results_dir: Path) -> List[Tuple[Path, Optional[datetime]]]:
    """Return [(path, timestamp_or_None)] sorted by timestamp ascending."""
    paths = sorted(results_dir.glob(PARQUET_GLOB))
    annotated = [(p, _parse_filename_timestamp(p)) for p in paths]
    # Sort by timestamp (None -> back of the queue), then by name for determinism.
    annotated.sort(
        key=lambda pt: (
            pt[1] is None,
            pt[1] or datetime.min.replace(tzinfo=timezone.utc),
            pt[0].name,
        )
    )
    return annotated


def select_latest_per_judge(
    parquets: List[Tuple[Path, Optional[datetime]]]
) -> Tuple[pd.DataFrame, Dict[str, Dict[str, object]]]:
    """
    Read all parquets and return a merged DataFrame.

    Latest-wins is applied at (judgeName, baselinePath, defectPath) granularity
    so that a partial later parquet does NOT erase a judge's earlier rows
    on disjoint pairs. Concretely (2026-06-10): tonight's control-only
    parquet contains Claude+Codex judgments for 200 control pairs, while
    the 2026-06-07 parquet contains Claude+Codex judgments for 400 defect
    pairs. Per-judge latest-wins would silently drop the 800 defect rows
    when the new parquet lands. Per-(judge, pair) latest-wins keeps all
    1200 disjoint rows plus the new 400.

    Within the same (judge, pair) tuple, the row from the latest-timestamped
    parquet wins (so the 2026-06-09 Llama re-run supersedes the 2026-06-07
    broken Llama rows on the same defect pairs).
    """
    # (judgeName, baselinePath, defectPath) -> (timestamp, source_path, row_series)
    latest_for_tuple: Dict[
        Tuple[str, str, str], Tuple[datetime, Path, pd.Series]
    ] = {}

    file_summary: List[Dict[str, object]] = []

    for path, ts in parquets:
        try:
            df = pq.read_table(path).to_pandas()
        except Exception as exc:
            file_summary.append(
                {
                    "path": str(path),
                    "timestamp": ts.isoformat() if ts else None,
                    "rows": None,
                    "error": f"failed to read parquet: {exc}",
                    "judges": [],
                }
            )
            continue

        per_judge_counts = (
            df.groupby("judgeName").size().to_dict() if "judgeName" in df.columns else {}
        )
        file_summary.append(
            {
                "path": str(path),
                "timestamp": ts.isoformat() if ts else None,
                "rows": int(len(df)),
                "judges": per_judge_counts,
                "used_for_judges": [],  # filled in below
                "rows_won": 0,  # filled in below
            }
        )

        effective_ts = ts or datetime.min.replace(tzinfo=timezone.utc)

        for _, row in df.iterrows():
            key = (row["judgeName"], row["baselinePath"], row["defectPath"])
            prior = latest_for_tuple.get(key)
            if prior is None or effective_ts > prior[0]:
                latest_for_tuple[key] = (effective_ts, path, row)

    # Tally per-file row-wins + per-judge usage.
    by_file_wins: Dict[Path, int] = defaultdict(int)
    by_file_judges_used: Dict[Path, set] = defaultdict(set)
    for (judge, _, _), (_, path, _) in latest_for_tuple.items():
        by_file_wins[path] += 1
        by_file_judges_used[path].add(judge)
    for entry in file_summary:
        p = Path(entry["path"])
        entry["rows_won"] = int(by_file_wins.get(p, 0))
        entry["used_for_judges"] = sorted(by_file_judges_used.get(p, set()))

    if not latest_for_tuple:
        return pd.DataFrame(), {"files": file_summary, "judges": {}}

    merged = pd.DataFrame([t[2] for t in latest_for_tuple.values()]).reset_index(drop=True)

    judge_provenance: Dict[str, Dict[str, object]] = {}
    for judge, sub in merged.groupby("judgeName"):
        # Per-judge provenance now lists ALL source parquets contributing
        # rows for that judge (no longer single-sourced).
        sources: Dict[str, int] = defaultdict(int)
        for (jname, b, d), (_, path, _) in latest_for_tuple.items():
            if jname == judge:
                sources[str(path)] += 1
        judge_provenance[judge] = {
            "rows": int(len(sub)),
            "source_parquets": [
                {"path": p, "rows": n} for p, n in sorted(sources.items())
            ],
        }

    return merged, {"files": file_summary, "judges": judge_provenance}


# ---------------------------------------------------------------------------
# Manifest join
# ---------------------------------------------------------------------------

def load_manifest(path: Path) -> pd.DataFrame:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if "results" not in raw or not isinstance(raw["results"], list):
        raise ValueError(f"Manifest at {path} missing 'results' list")
    rows = []
    for entry in raw["results"]:
        # Manifest v1 had no expected_verdict (all pairs implicitly defects);
        # manifest v2 (2026-06-10) tags every pair 'fail' or 'pass'.
        ev = entry.get("expected_verdict", "fail")
        if ev not in ("fail", "pass"):
            raise ValueError(
                f"Manifest entry {entry.get('defect_id')} has invalid "
                f"expected_verdict={ev!r}; must be 'fail' or 'pass'"
            )
        rows.append(
            {
                "baselinePath": entry["baseline"],
                "defectPath": entry["defect"],
                "app": entry["app"],
                "defect_id": entry["defect_id"],
                "manifest_category": entry["category"],
                "surface": entry["surface"],
                "expected_verdict": ev,
            }
        )
    df = pd.DataFrame(rows)
    if df.duplicated(subset=["defect_id"]).any():
        # We can no longer dedup by (baseline, defect) because v2 control
        # pairs intentionally set defect == baseline; dedup by defect_id.
        dups = df[df.duplicated(subset=["defect_id"], keep=False)]
        raise ValueError(
            f"Manifest has duplicate defect_id values:\n{dups.head()}"
        )
    return df


def join_judgments_to_manifest(
    judgments: pd.DataFrame, manifest: pd.DataFrame
) -> Tuple[pd.DataFrame, Dict[str, int]]:
    before = len(judgments)
    joined = judgments.merge(
        manifest, on=["baselinePath", "defectPath"], how="left", indicator=True
    )
    unmatched = int((joined["_merge"] == "left_only").sum())
    matched = joined[joined["_merge"] == "both"].drop(columns=["_merge"]).copy()
    # Ground truth is now per-pair from the manifest (v2: 'fail' for
    # 400 defect pairs, 'pass' for 200 control pairs). v1 manifests
    # default every pair to 'fail' inside load_manifest().
    matched["ground_truth"] = matched["expected_verdict"]
    diagnostics = {
        "judgment_rows_total": int(before),
        "judgment_rows_matched": int(len(matched)),
        "judgment_rows_unmatched": unmatched,
        "manifest_pairs_total": int(len(manifest)),
        "manifest_defect_pairs": int((manifest["expected_verdict"] == "fail").sum()),
        "manifest_control_pairs": int((manifest["expected_verdict"] == "pass").sum()),
    }
    return matched, diagnostics


# ---------------------------------------------------------------------------
# Metrics
# ---------------------------------------------------------------------------

def is_valid_verdict(row: pd.Series) -> bool:
    """Llama's broken run sets malformed=True; treat any malformed row as
    'no verdict' for the purposes of agreement / accuracy. Verdicts not in
    {fail, pass} are also dropped."""
    if bool(row.get("malformed", False)):
        return False
    return row.get("verdict") in VERDICT_CATEGORIES


def per_judge_classification(
    df: pd.DataFrame,
) -> Dict[str, Dict[str, object]]:
    """For each judge, compute the full binary-classifier metric pack:
    n_total, n_valid, n_malformed, n_invalid_verdict, confusion matrix
    (TP/FP/TN/FN), accuracy, precision, recall (sensitivity), specificity
    (true negative rate), F1, balanced accuracy, MCC, FPR, FNR.

    Per-row `ground_truth` column is required (added by
    join_judgments_to_manifest from the per-pair `expected_verdict`).
    A metric is reported as NaN when its denominator is zero (e.g.
    precision when the judge never predicts 'fail').
    """
    out: Dict[str, Dict[str, object]] = {}
    for judge, sub in df.groupby("judgeName"):
        n_total = int(len(sub))
        malformed_mask = sub["malformed"].astype(bool)
        verdict_in_set = sub["verdict"].isin(VERDICT_CATEGORIES)
        valid_mask = (~malformed_mask) & verdict_in_set
        n_malformed = int(malformed_mask.sum())
        n_invalid = int(((~malformed_mask) & (~verdict_in_set)).sum())
        n_valid = int(valid_mask.sum())

        valid = sub[valid_mask]
        gt = valid["ground_truth"]
        pred = valid["verdict"]
        TP = int(((pred == "fail") & (gt == "fail")).sum())
        FN = int(((pred == "pass") & (gt == "fail")).sum())
        FP = int(((pred == "fail") & (gt == "pass")).sum())
        TN = int(((pred == "pass") & (gt == "pass")).sum())

        n_pos = TP + FN  # ground-truth positives (defect pairs)
        n_neg = TN + FP  # ground-truth negatives (control pairs)
        n_pred_fail = TP + FP
        n_pred_pass = TN + FN

        def _safe_div(num: float, den: float) -> float:
            return float(num) / float(den) if den else float("nan")

        accuracy = _safe_div(TP + TN, n_valid)
        recall_sensitivity = _safe_div(TP, n_pos)
        specificity = _safe_div(TN, n_neg)
        precision = _safe_div(TP, n_pred_fail)
        fpr = _safe_div(FP, n_neg)
        fnr = _safe_div(FN, n_pos)
        if (precision + recall_sensitivity) > 0 and np.isfinite(precision) and np.isfinite(
            recall_sensitivity
        ):
            f1 = 2 * precision * recall_sensitivity / (precision + recall_sensitivity)
        else:
            f1 = float("nan")
        if np.isfinite(recall_sensitivity) and np.isfinite(specificity):
            balanced_accuracy = (recall_sensitivity + specificity) / 2
        else:
            balanced_accuracy = float("nan")
        mcc_denom_sq = (
            (TP + FP) * (TP + FN) * (TN + FP) * (TN + FN)
        )
        mcc = (
            (TP * TN - FP * FN) / float(mcc_denom_sq) ** 0.5
            if mcc_denom_sq > 0
            else float("nan")
        )

        out[judge] = {
            "n_total": n_total,
            "n_valid": n_valid,
            "n_malformed": n_malformed,
            "n_invalid_verdict": n_invalid,
            "confusion_matrix": {
                "TP": TP,
                "FP": FP,
                "TN": TN,
                "FN": FN,
                "n_ground_truth_positives": n_pos,
                "n_ground_truth_negatives": n_neg,
                "n_predicted_fail": n_pred_fail,
                "n_predicted_pass": n_pred_pass,
            },
            "accuracy": accuracy,
            "recall_sensitivity": recall_sensitivity,
            "specificity_tnr": specificity,
            "precision": precision,
            "f1": f1,
            "balanced_accuracy": balanced_accuracy,
            "mcc": mcc,
            "false_positive_rate": fpr,
            "false_negative_rate": fnr,
            # Back-compat aliases for older report consumers:
            "n_predicted_fail": n_pred_fail,
            "n_predicted_pass": n_pred_pass,
            "accuracy_vs_truth": accuracy,
            "recall_vs_truth": recall_sensitivity,
            "precision_vs_truth": precision if np.isfinite(precision) else None,
        }
    return out


def cohen_kappa(r1: List[str], r2: List[str], categories: List[str]) -> float:
    """Cohen's kappa over a fixed category list (Cohen 1960)."""
    if len(r1) != len(r2) or len(r1) == 0:
        return float("nan")
    n = len(r1)
    idx = {c: i for i, c in enumerate(categories)}
    k = len(categories)
    cm = np.zeros((k, k), dtype=float)
    for a, b in zip(r1, r2):
        cm[idx[a], idx[b]] += 1
    po = float(np.trace(cm)) / n
    row = cm.sum(axis=1) / n
    col = cm.sum(axis=0) / n
    pe = float(np.dot(row, col))
    if pe == 1.0:
        return 1.0
    return (po - pe) / (1.0 - pe)


def fleiss_kappa(matrix: np.ndarray) -> float:
    """
    Fleiss' kappa (Fleiss 1971).

    `matrix` is an (N x k) integer matrix where matrix[i, j] = number of raters
    that assigned subject i to category j. Every row must sum to the same total
    n_raters.
    """
    N, k = matrix.shape
    if N == 0:
        return float("nan")
    n_raters_per_subject = matrix.sum(axis=1)
    if not np.all(n_raters_per_subject == n_raters_per_subject[0]):
        # Variable-rater rows: kappa undefined under classical Fleiss.
        return float("nan")
    n = int(n_raters_per_subject[0])
    if n < 2:
        return float("nan")

    # Per-subject agreement P_i
    P_i = (np.sum(matrix * matrix, axis=1) - n) / (n * (n - 1))
    P_bar = float(np.mean(P_i))

    # Per-category proportion p_j
    p_j = matrix.sum(axis=0) / (N * n)
    Pe_bar = float(np.sum(p_j * p_j))

    if Pe_bar == 1.0:
        return 1.0
    return (P_bar - Pe_bar) / (1.0 - Pe_bar)


def bootstrap_ci(
    estimator,
    n_units: int,
    n_resamples: int,
    rng: np.random.Generator,
    ci: float = 0.95,
) -> Tuple[float, float, float]:
    """
    Generic bootstrap CI. `estimator(idx)` takes a 1D index array of length
    n_units and returns a scalar. Returns (point, lo, hi) using percentile
    method. NaN estimates are dropped from the percentile computation; if
    fewer than 10 finite resamples survive, lo/hi come back as NaN.
    """
    point = estimator(np.arange(n_units))
    if n_units == 0 or n_resamples <= 0:
        return point, float("nan"), float("nan")
    samples = np.empty(n_resamples, dtype=float)
    for b in range(n_resamples):
        idx = rng.integers(0, n_units, size=n_units)
        samples[b] = estimator(idx)
    finite = samples[np.isfinite(samples)]
    if finite.size < 10:
        return point, float("nan"), float("nan")
    alpha = (1.0 - ci) / 2.0
    lo = float(np.quantile(finite, alpha))
    hi = float(np.quantile(finite, 1 - alpha))
    return point, lo, hi


def build_paired_matrix(
    df: pd.DataFrame, judge_a: str, judge_b: str
) -> Tuple[List[str], List[str], int]:
    """
    Return (verdicts_a, verdicts_b, n_pairs) over the set of (baselinePath,
    defectPath) pairs for which BOTH judges produced a valid verdict.
    """
    valid = df[
        (~df["malformed"].astype(bool)) & df["verdict"].isin(VERDICT_CATEGORIES)
    ]
    a = valid[valid["judgeName"] == judge_a][["baselinePath", "defectPath", "verdict"]]
    b = valid[valid["judgeName"] == judge_b][["baselinePath", "defectPath", "verdict"]]
    merged = a.merge(
        b, on=["baselinePath", "defectPath"], suffixes=("_a", "_b")
    )
    return (
        merged["verdict_a"].tolist(),
        merged["verdict_b"].tolist(),
        int(len(merged)),
    )


def build_fleiss_matrix(
    df: pd.DataFrame, judges: List[str]
) -> Tuple[np.ndarray, List[Tuple[str, str]]]:
    """
    Build the (N x k) count matrix Fleiss' kappa needs. Each row corresponds
    to a pair (baselinePath, defectPath) for which ALL `judges` produced a
    valid verdict; cell value = how many of those judges chose each category.
    Returns the matrix plus the list of (baseline, defect) pair ids row-wise.
    """
    cat_idx = {c: i for i, c in enumerate(VERDICT_CATEGORIES)}
    valid = df[
        (~df["malformed"].astype(bool)) & df["verdict"].isin(VERDICT_CATEGORIES)
    ]
    # pair -> { judge -> verdict }
    by_pair: Dict[Tuple[str, str], Dict[str, str]] = defaultdict(dict)
    for _, row in valid.iterrows():
        key = (row["baselinePath"], row["defectPath"])
        by_pair[key][row["judgeName"]] = row["verdict"]

    keep_pairs: List[Tuple[str, str]] = []
    rows: List[List[int]] = []
    for pair, judge_verdicts in by_pair.items():
        if not all(j in judge_verdicts for j in judges):
            continue
        row = [0] * len(VERDICT_CATEGORIES)
        for j in judges:
            row[cat_idx[judge_verdicts[j]]] += 1
        rows.append(row)
        keep_pairs.append(pair)

    if not rows:
        return np.zeros((0, len(VERDICT_CATEGORIES)), dtype=int), []
    # Deterministic ordering: sort by (baseline, defect) tuple.
    order = sorted(range(len(keep_pairs)), key=lambda i: keep_pairs[i])
    matrix = np.array([rows[i] for i in order], dtype=int)
    pairs_sorted = [keep_pairs[i] for i in order]
    return matrix, pairs_sorted


# ---------------------------------------------------------------------------
# Breakdowns + ops stats
# ---------------------------------------------------------------------------

def accuracy_breakdown(
    df: pd.DataFrame,
    group_col: str,
    *,
    rng: Optional[np.random.Generator] = None,
    n_resamples: int = 1000,
) -> Dict[str, Dict[str, Dict[str, float]]]:
    """
    Returns {judge: {group_value: {"n_valid": int, "n_fail": int, "accuracy": float,
                                   "ci_lo": float, "ci_hi": float}}}.
    Uses only rows where verdict is valid (not malformed, in {fail, pass}).
    Bootstrap CIs computed via percentile resampling over the subgroup's
    binary correctness vector (1 if verdict == 'fail', else 0). At
    n_resamples=1000 + seed-pinned RNG, identical inputs produce identical CIs.
    For n_valid <= 1 the CI is reported as the point estimate (degenerate).
    """
    if rng is None:
        rng = np.random.default_rng(42)
    out: Dict[str, Dict[str, Dict[str, float]]] = {}
    valid = df[
        (~df["malformed"].astype(bool)) & df["verdict"].isin(VERDICT_CATEGORIES)
    ]
    for judge, sub_j in valid.groupby("judgeName"):
        per_group: Dict[str, Dict[str, float]] = {}
        for grp, sub_g in sub_j.groupby(group_col):
            n_valid = int(len(sub_g))
            # Correctness is verdict == per-pair ground_truth. For defect
            # categories (gt == 'fail') this is recall; for the control
            # category (gt == 'pass') this is specificity. The CI is over
            # the per-pair correctness vector regardless.
            correct_mask = (sub_g["verdict"] == sub_g["ground_truth"]).to_numpy(dtype=int)
            n_correct = int(correct_mask.sum())
            n_fail = int((sub_g["verdict"] == "fail").sum())
            acc = (n_correct / n_valid) if n_valid else float("nan")
            if n_valid <= 1:
                ci_lo = ci_hi = acc
            else:
                idx = rng.integers(0, n_valid, size=(n_resamples, n_valid))
                resampled = correct_mask[idx].mean(axis=1)
                ci_lo = float(np.quantile(resampled, 0.025))
                ci_hi = float(np.quantile(resampled, 0.975))
            per_group[str(grp)] = {
                "n_valid": n_valid,
                "n_correct": n_correct,
                "n_fail": n_fail,
                "accuracy": acc,
                "ci_lo": ci_lo,
                "ci_hi": ci_hi,
            }
        out[judge] = per_group
    return out


def latency_stats(df: pd.DataFrame) -> Dict[str, Dict[str, float]]:
    out: Dict[str, Dict[str, float]] = {}
    for judge, sub in df.groupby("judgeName"):
        lat = sub["latencyMs"].dropna().astype(float)
        if len(lat) == 0:
            out[judge] = {"n": 0, "mean_ms": float("nan"), "median_ms": float("nan"), "p95_ms": float("nan")}
            continue
        out[judge] = {
            "n": int(len(lat)),
            "mean_ms": float(lat.mean()),
            "median_ms": float(lat.median()),
            "p95_ms": float(np.quantile(lat, 0.95)),
        }
    return out


def cost_stats(df: pd.DataFrame) -> Dict[str, Dict[str, float]]:
    out: Dict[str, Dict[str, float]] = {}
    for judge, sub in df.groupby("judgeName"):
        cost = sub["costUsd"].dropna().astype(float)
        out[judge] = {
            "n": int(len(cost)),
            "total_usd": float(cost.sum()) if len(cost) else float("nan"),
            "mean_per_call_usd": float(cost.mean()) if len(cost) else float("nan"),
        }
    return out


def failure_mode_stats(df: pd.DataFrame) -> Dict[str, Dict[str, int]]:
    out: Dict[str, Dict[str, int]] = {}
    for judge, sub in df.groupby("judgeName"):
        out[judge] = {
            "n_total": int(len(sub)),
            "n_malformed": int(sub["malformed"].astype(bool).sum()),
            "n_retried": int(sub["retried"].astype(bool).sum()),
            "n_invalid_verdict": int(
                ((~sub["malformed"].astype(bool)) & (~sub["verdict"].isin(VERDICT_CATEGORIES))).sum()
            ),
        }
    return out


# ---------------------------------------------------------------------------
# Markdown rendering
# ---------------------------------------------------------------------------

def landis_koch(k: float) -> str:
    if not np.isfinite(k):
        return "n/a"
    if k < 0.20:
        return "poor"
    if k < 0.40:
        return "fair"
    if k < 0.60:
        return "moderate"
    if k < 0.80:
        return "substantial"
    return "almost perfect"


def fmt_pct(x: float) -> str:
    return "n/a" if not np.isfinite(x) else f"{100*x:.1f}%"


def fmt_k(x: float) -> str:
    return "n/a" if not np.isfinite(x) else f"{x:.3f}"


def fmt_usd(x: float) -> str:
    return "n/a" if not np.isfinite(x) else f"${x:.4f}"


def fmt_ms(x: float) -> str:
    return "n/a" if not np.isfinite(x) else f"{x:,.0f}"


def render_markdown(report: Dict[str, object]) -> str:
    lines: List[str] = []
    lines.append("# Phase 1 Analysis — Visual Oracle Bench (synthetic-HTML pilot)\n")
    lines.append(f"_Generated: {report['generated_at']}_  ")
    lines.append(f"_Bootstrap seed: {report['bootstrap_seed']} | resamples: {report['bootstrap_resamples']}_\n")
    gt_src = report.get("ground_truth_source", "")
    lines.append(f"Ground-truth source: {gt_src}\n")
    nc_rationale = report.get("noncomparable_rationale")
    if nc_rationale:
        lines.append(
            f"**Comparable-judges note.** {nc_rationale} Comparable: "
            f"`{', '.join(report.get('comparable_judges', []))}`. "
            f"Non-comparable (appendix only): "
            f"`{', '.join(report.get('noncomparable_judges', [])) or 'none'}`.\n"
        )

    # ---- Data inputs
    lines.append("## Data inputs\n")
    lines.append("| Parquet | Timestamp | Rows | Judges (rows) | Used for |")
    lines.append("|---|---|---:|---|---|")
    for f in report["data_inputs"]["files"]:
        path_short = Path(f["path"]).name
        ts = f["timestamp"] or "unparseable"
        rows = "ERR" if f["rows"] is None else str(f["rows"])
        if f.get("error"):
            judges_str = f"_error: {f['error']}_"
        else:
            judges_str = ", ".join(f"{j}={n}" for j, n in sorted(f["judges"].items())) or "(none)"
        used = ", ".join(f["used_for_judges"]) or "(superseded)"
        lines.append(f"| `{path_short}` | {ts} | {rows} | {judges_str} | {used} |")
    lines.append("")

    expected = report["expected_judges"]
    present = sorted(report["data_inputs"]["judges"].keys())
    missing = [j for j in expected if j not in present]
    lines.append(f"- Judges with usable rows: **{', '.join(present) or 'NONE'}**")
    if missing:
        lines.append(
            f"- **MISSING JUDGES**: {', '.join(missing)} — no parquet rows found. "
            "These judges are omitted from all metrics below. If a re-run is in flight, "
            "regenerate this report once the new parquet lands."
        )
    lines.append("")

    join_diag = report["manifest_join"]
    lines.append(
        f"- Manifest pairs: **{join_diag['manifest_pairs_total']}** | "
        f"judgment rows joined: **{join_diag['judgment_rows_matched']} / "
        f"{join_diag['judgment_rows_total']}** "
        f"({join_diag['judgment_rows_unmatched']} unmatched)\n"
    )

    # ---- Headline
    lines.append("## Headline numbers\n")
    tldr = report.get("tldr", "")
    lines.append(tldr + "\n")

    # ---- Per-judge oracle metrics (full confusion matrix)
    lines.append("## Per-judge oracle metrics\n")
    lines.append(
        "Confusion matrix is computed against per-pair `ground_truth` "
        "(from manifest v2: `fail` for 400 defect pairs, `pass` for 200 "
        "control pairs). TP/FN/FP/TN refer to the binary `fail` decision: "
        "TP = correctly flagged a defect, FP = false alarm on a control, "
        "FN = missed a defect, TN = correctly cleared a control.\n"
    )
    lines.append(
        "| Judge | n_valid | TP | FP | TN | FN | accuracy | recall | specificity | precision | F1 | MCC | bal_acc |"
    )
    lines.append("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|")
    for judge in sorted(report["per_judge_classification"].keys()):
        c = report["per_judge_classification"][judge]
        cm = c.get("confusion_matrix", {})
        lines.append(
            f"| `{judge}` | {c['n_valid']} | {cm.get('TP', 0)} | {cm.get('FP', 0)} | "
            f"{cm.get('TN', 0)} | {cm.get('FN', 0)} | "
            f"{fmt_pct(c.get('accuracy', float('nan')))} | "
            f"{fmt_pct(c.get('recall_sensitivity', float('nan')))} | "
            f"{fmt_pct(c.get('specificity_tnr', float('nan')))} | "
            f"{fmt_pct(c.get('precision', float('nan')))} | "
            f"{fmt_k(c.get('f1', float('nan')))} | "
            f"{fmt_k(c.get('mcc', float('nan')))} | "
            f"{fmt_pct(c.get('balanced_accuracy', float('nan')))} |"
        )
    lines.append("")

    # ---- Pairwise kappa (comparable judges only)
    lines.append("## Inter-judge agreement (Cohen's kappa) — comparable judges\n")
    lines.append(
        "Pairwise nominal kappa over `{fail, pass}` on the intersection "
        "of pairs both judges produced a valid verdict for, including BOTH "
        "defect and control pairs. CIs are percentile bootstrap over pair "
        "indices (seed and resample count above). Non-comparable judges "
        "(Llama) appear in a separate appendix table below.\n"
    )
    lines.append("| Judge A | Judge B | n_pairs | kappa | 95% CI | Landis-Koch |")
    lines.append("|---|---|---:|---:|---|---|")
    for entry in report.get("pairwise_cohen_kappa_comparable", []):
        ci_lo, ci_hi = entry["ci95"]
        ci_str = "n/a" if not (np.isfinite(ci_lo) and np.isfinite(ci_hi)) else f"[{ci_lo:.3f}, {ci_hi:.3f}]"
        lines.append(
            f"| `{entry['judge_a']}` | `{entry['judge_b']}` | "
            f"{entry['n_pairs']} | {fmt_k(entry['kappa'])} | {ci_str} | "
            f"{landis_koch(entry['kappa'])} |"
        )
    lines.append("")

    fk = report.get("fleiss_kappa_comparable", {})
    if fk.get("n_subjects", 0) > 0:
        ci_lo, ci_hi = fk["ci95"]
        ci_str = "n/a" if not (np.isfinite(ci_lo) and np.isfinite(ci_hi)) else f"[{ci_lo:.3f}, {ci_hi:.3f}]"
        lines.append(
            f"**Fleiss' kappa across {', '.join(fk['judges'])} "
            f"(n_subjects = {fk['n_subjects']}, k = {fk['n_categories']}): "
            f"{fmt_k(fk['kappa'])}** — 95% CI {ci_str} ({landis_koch(fk['kappa'])}).\n"
        )
    else:
        note = fk.get("note", "no pair had a valid verdict from every judge")
        lines.append(f"**Fleiss' kappa (comparable judges):** n/a — {note}.\n")

    # ---- Non-comparable kappa (Llama vs comparable, integration-failure appendix)
    nc_pairs = report.get("pairwise_cohen_kappa_noncomparable_cross", [])
    if nc_pairs:
        lines.append("## Appendix A: non-comparable cross-modal kappa (Llama vs comparable judges)\n")
        lines.append(
            "These rows are reported for the integration-failure-mode appendix "
            "only. The Llama judge was fed a side-by-side composite PNG "
            "(see manuscript §4.8, Llama composite workaround). The composite "
            "format confounds capability with input modality, so these kappa "
            "values are NOT evidence of a model-quality difference.\n"
        )
        lines.append("| Judge A | Judge B | n_pairs | kappa | 95% CI | Landis-Koch |")
        lines.append("|---|---|---:|---:|---|---|")
        for entry in nc_pairs:
            ci_lo, ci_hi = entry["ci95"]
            ci_str = "n/a" if not (np.isfinite(ci_lo) and np.isfinite(ci_hi)) else f"[{ci_lo:.3f}, {ci_hi:.3f}]"
            lines.append(
                f"| `{entry['judge_a']}` | `{entry['judge_b']}` | "
                f"{entry['n_pairs']} | {fmt_k(entry['kappa'])} | {ci_str} | "
                f"{landis_koch(entry['kappa'])} |"
            )
        lines.append("")

    # ---- Per-app breakdown
    lines.append("## Per-app breakdown\n")
    app_judges = sorted(report["per_app_accuracy"].keys())
    apps = sorted({a for j in app_judges for a in report["per_app_accuracy"][j].keys()})
    header = "| App | " + " | ".join(f"`{j}` accuracy (n)" for j in app_judges) + " |"
    sep = "|---|" + "|".join(["---:"] * len(app_judges)) + "|"
    lines.append(header)
    lines.append(sep)
    for app in apps:
        cells = []
        for j in app_judges:
            cell = report["per_app_accuracy"][j].get(app)
            if cell is None:
                cells.append("n/a")
            else:
                cells.append(f"{fmt_pct(cell['accuracy'])} ({cell['n_valid']})")
        lines.append(f"| {app} | " + " | ".join(cells) + " |")
    lines.append("")

    # ---- Per-category breakdown (with 95% bootstrap CIs)
    lines.append("## Per-category breakdown\n")
    lines.append(
        "Per-cell value = fraction of valid verdicts that matched the per-pair "
        "`ground_truth`. For the six defect categories (color/contrast/layout/"
        "missing/truncation/zorder) this is **recall** (sensitivity) at "
        "n=64-72 pairs/category. For the `control` category (n=200) this is "
        "**specificity** (true negative rate). 95% percentile-bootstrap CIs "
        "with seed 42, 1000 resamples. At per-category n=64-72, CIs are wide; "
        "cross-judge differences within overlapping CIs should NOT be "
        "interpreted as evidence of judge-specific weakness.\n"
    )
    cat_judges = sorted(report["per_category_accuracy"].keys())
    cats = sorted({c for j in cat_judges for c in report["per_category_accuracy"][j].keys()})
    header = "| Category | " + " | ".join(f"`{j}` (n) accuracy [95% CI]" for j in cat_judges) + " |"
    sep = "|---|" + "|".join(["---:"] * len(cat_judges)) + "|"
    lines.append(header)
    lines.append(sep)
    for cat in cats:
        cells = []
        for j in cat_judges:
            cell = report["per_category_accuracy"][j].get(cat)
            if cell is None:
                cells.append("n/a")
            else:
                cells.append(
                    f"{fmt_pct(cell['accuracy'])} (n={cell['n_valid']}) "
                    f"[{fmt_pct(cell['ci_lo'])}, {fmt_pct(cell['ci_hi'])}]"
                )
        lines.append(f"| {cat} | " + " | ".join(cells) + " |")
    lines.append("")

    # ---- Latency
    lines.append("## Latency\n")
    lines.append("| Judge | n | mean (ms) | median (ms) | p95 (ms) |")
    lines.append("|---|---:|---:|---:|---:|")
    for judge in sorted(report["latency"].keys()):
        l = report["latency"][judge]
        lines.append(
            f"| `{judge}` | {l['n']} | {fmt_ms(l['mean_ms'])} | "
            f"{fmt_ms(l['median_ms'])} | {fmt_ms(l['p95_ms'])} |"
        )
    lines.append("")

    # ---- Cost
    lines.append("## Cost\n")
    lines.append("| Judge | n | total USD | USD / call |")
    lines.append("|---|---:|---:|---:|")
    for judge in sorted(report["cost"].keys()):
        c = report["cost"][judge]
        lines.append(
            f"| `{judge}` | {c['n']} | {fmt_usd(c['total_usd'])} | "
            f"{fmt_usd(c['mean_per_call_usd'])} |"
        )
    lines.append("")

    # ---- Failure modes
    lines.append("## Failure modes\n")
    lines.append("| Judge | n_total | n_malformed | n_retried | n_invalid_verdict |")
    lines.append("|---|---:|---:|---:|---:|")
    for judge in sorted(report["failure_modes"].keys()):
        f = report["failure_modes"][judge]
        lines.append(
            f"| `{judge}` | {f['n_total']} | {f['n_malformed']} | "
            f"{f['n_retried']} | {f['n_invalid_verdict']} |"
        )
    lines.append("")

    return "\n".join(lines) + "\n"


# ---------------------------------------------------------------------------
# Top-level compute pipeline
# ---------------------------------------------------------------------------

EXPECTED_JUDGES = ["openai-codex", "claude-oauth", "llama"]


def _compute_pairwise(
    df: pd.DataFrame,
    judges: List[str],
    rng: np.random.Generator,
    n_resamples: int,
) -> List[Dict[str, object]]:
    out: List[Dict[str, object]] = []
    for i, ja in enumerate(judges):
        for jb in judges[i + 1 :]:
            a, b, n = build_paired_matrix(df, ja, jb)
            if n == 0:
                out.append(
                    {
                        "judge_a": ja,
                        "judge_b": jb,
                        "n_pairs": 0,
                        "kappa": float("nan"),
                        "ci95": [float("nan"), float("nan")],
                    }
                )
                continue
            a_arr = np.array(a)
            b_arr = np.array(b)

            def est(idx: np.ndarray, _aa=a_arr, _bb=b_arr) -> float:
                return cohen_kappa(_aa[idx].tolist(), _bb[idx].tolist(), VERDICT_CATEGORIES)

            point, lo, hi = bootstrap_ci(est, n, n_resamples, rng)
            out.append(
                {
                    "judge_a": ja,
                    "judge_b": jb,
                    "n_pairs": n,
                    "kappa": point,
                    "ci95": [lo, hi],
                }
            )
    return out


def _compute_fleiss_block(
    df: pd.DataFrame,
    judges: List[str],
    rng: np.random.Generator,
    n_resamples: int,
) -> Dict[str, object]:
    if len(judges) < 3:
        # Fleiss requires >= 3 raters; below that it collapses to Cohen.
        return {
            "judges": judges,
            "n_subjects": 0,
            "n_categories": len(VERDICT_CATEGORIES),
            "kappa": float("nan"),
            "ci95": [float("nan"), float("nan")],
            "note": "Fleiss undefined for fewer than 3 raters; see pairwise Cohen.",
        }
    fleiss_mat, _ = build_fleiss_matrix(df, judges)
    if fleiss_mat.shape[0] == 0:
        return {
            "judges": judges,
            "n_subjects": 0,
            "n_categories": len(VERDICT_CATEGORIES),
            "kappa": float("nan"),
            "ci95": [float("nan"), float("nan")],
        }
    point = fleiss_kappa(fleiss_mat)

    def est_fleiss(idx: np.ndarray, _m=fleiss_mat) -> float:
        return fleiss_kappa(_m[idx])

    _, lo, hi = bootstrap_ci(est_fleiss, fleiss_mat.shape[0], n_resamples, rng)
    return {
        "judges": judges,
        "n_subjects": int(fleiss_mat.shape[0]),
        "n_categories": int(fleiss_mat.shape[1]),
        "kappa": point,
        "ci95": [lo, hi],
    }


def compute_report(
    df: pd.DataFrame,
    inputs_meta: Dict[str, object],
    manifest_join_diag: Dict[str, int],
    *,
    seed: int,
    n_resamples: int,
) -> Dict[str, object]:
    rng = np.random.default_rng(seed)

    per_judge = per_judge_classification(df)

    judges = sorted(df["judgeName"].unique().tolist())
    # Llama is split out into a non-comparable bucket because its input
    # modality (side-by-side composite PNG) differs from the others
    # (paired images). Headline kappa / Fleiss use comparable judges only.
    comparable_judges = [j for j in judges if j not in LLAMA_JUDGE_NAMES]
    noncomparable_judges = [j for j in judges if j in LLAMA_JUDGE_NAMES]

    pairwise_all = _compute_pairwise(df, judges, rng, n_resamples)
    pairwise_comparable = _compute_pairwise(
        df, comparable_judges, np.random.default_rng(seed), n_resamples
    )
    pairwise_noncomparable_cross: List[Dict[str, object]] = []
    for nc in noncomparable_judges:
        for cj in comparable_judges:
            ja, jb = sorted([nc, cj])
            entry = next(
                (
                    e
                    for e in pairwise_all
                    if e["judge_a"] == ja and e["judge_b"] == jb
                ),
                None,
            )
            if entry is not None:
                pairwise_noncomparable_cross.append(entry)

    fleiss_all = _compute_fleiss_block(df, judges, rng, n_resamples)
    fleiss_comparable = _compute_fleiss_block(
        df, comparable_judges, np.random.default_rng(seed + 1), n_resamples
    )

    per_app = accuracy_breakdown(df, "app")
    per_cat = accuracy_breakdown(df, "manifest_category")
    latency = latency_stats(df)
    cost = cost_stats(df)
    failures = failure_mode_stats(df)

    # TL;DR: lead with comparable-judge headline metrics.
    headline_bits = []
    for judge in sorted(comparable_judges):
        c = per_judge.get(judge, {})
        if not c:
            continue
        headline_bits.append(
            f"`{judge}` acc={fmt_pct(c.get('accuracy', float('nan')))} "
            f"recall={fmt_pct(c.get('recall_sensitivity', float('nan')))} "
            f"spec={fmt_pct(c.get('specificity_tnr', float('nan')))} "
            f"prec={fmt_pct(c.get('precision', float('nan')))} "
            f"F1={fmt_k(c.get('f1', float('nan')))} "
            f"MCC={fmt_k(c.get('mcc', float('nan')))} "
            f"(n_valid={c.get('n_valid', 0)})"
        )
    kappa_bits = []
    for entry in pairwise_comparable:
        if entry["n_pairs"] == 0:
            continue
        kappa_bits.append(
            f"`{entry['judge_a']}`/`{entry['judge_b']}` kappa={fmt_k(entry['kappa'])} "
            f"(n={entry['n_pairs']})"
        )
    fleiss_str = ""
    if fleiss_comparable["n_subjects"] > 0:
        fleiss_str = (
            f" Fleiss' kappa across {len(fleiss_comparable['judges'])} comparable judges = "
            f"{fmt_k(fleiss_comparable['kappa'])} on n={fleiss_comparable['n_subjects']} subjects."
        )
    tldr = (
        "[comparable judges only — Llama excluded per modality-confound disclosure] "
        "Per-judge: " + "; ".join(headline_bits) + ". "
        "Pairwise Cohen kappa: " + ("; ".join(kappa_bits) if kappa_bits else "n/a")
        + "." + fleiss_str
    )

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "bootstrap_seed": seed,
        "bootstrap_resamples": n_resamples,
        "ground_truth_source": (
            "Per-pair `expected_verdict` from manifest v2 "
            "(_pairs_manifest_v2.json): 'fail' for 400 defect pairs, "
            "'pass' for 200 control pairs (baseline == defect). "
            "Precision, specificity, F1, MCC are now defined."
        ),
        "expected_judges": EXPECTED_JUDGES,
        "comparable_judges": comparable_judges,
        "noncomparable_judges": noncomparable_judges,
        "noncomparable_rationale": (
            "Llama judges were fed a side-by-side composite PNG (multi-image "
            "workaround for Ollama's single-image input limit); other "
            "judges received paired images. Per-judge metrics are kept "
            "for the integration-failure appendix but Llama is excluded "
            "from headline pairwise / Fleiss kappa."
        ),
        "data_inputs": inputs_meta,
        "manifest_join": manifest_join_diag,
        "tldr": tldr,
        "per_judge_classification": per_judge,
        "pairwise_cohen_kappa_comparable": pairwise_comparable,
        "pairwise_cohen_kappa_noncomparable_cross": pairwise_noncomparable_cross,
        "pairwise_cohen_kappa": pairwise_comparable,  # legacy alias for older consumers
        "fleiss_kappa_comparable": fleiss_comparable,
        "fleiss_kappa_all": fleiss_all,
        "fleiss_kappa": fleiss_comparable,  # legacy alias
        "per_app_accuracy": per_app,
        "per_category_accuracy": per_cat,
        "latency": latency,
        "cost": cost,
        "failure_modes": failures,
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def _json_default(o):
    if isinstance(o, (np.floating,)):
        v = float(o)
        return v if np.isfinite(v) else None
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, np.ndarray):
        return o.tolist()
    if isinstance(o, float) and not np.isfinite(o):
        return None
    if isinstance(o, Path):
        return str(o)
    raise TypeError(f"Object of type {type(o)} is not JSON serializable")


def main(argv: Optional[List[str]] = None) -> int:
    p = argparse.ArgumentParser(
        description="W8 Phase 1 analysis script — see module docstring for details.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Print which parquets would be read and exit; no computation.",
    )
    p.add_argument(
        "--seed",
        type=int,
        default=42,
        help="RNG seed for bootstrap resampling (default: 42).",
    )
    p.add_argument(
        "--resamples",
        type=int,
        default=1000,
        help="Number of bootstrap resamples (default: 1000).",
    )
    p.add_argument(
        "--results-dir",
        type=Path,
        default=RESULTS_DIR,
        help=f"Directory containing judgments_*.parquet (default: {RESULTS_DIR}).",
    )
    p.add_argument(
        "--manifest",
        type=Path,
        default=MANIFEST_PATH,
        help=f"Pair manifest JSON (default: {MANIFEST_PATH}).",
    )
    p.add_argument(
        "--output-dir",
        type=Path,
        default=OUTPUT_DIR,
        help=f"Output directory (default: {OUTPUT_DIR}).",
    )
    args = p.parse_args(argv)

    parquets = discover_parquets(args.results_dir)

    if args.dry_run:
        print(f"Results dir: {args.results_dir}")
        print(f"Manifest:    {args.manifest} (exists: {args.manifest.exists()})")
        print(f"Output dir:  {args.output_dir}")
        print(f"Seed:        {args.seed}  resamples: {args.resamples}")
        print(f"Expected judges: {EXPECTED_JUDGES}")
        print(f"Discovered {len(parquets)} parquet(s):")
        if not parquets:
            print("  (none) — no judgments_*.parquet files in results dir.")
        for path, ts in parquets:
            ts_str = ts.isoformat() if ts else "UNPARSEABLE_TIMESTAMP"
            print(f"  - {path.name}  ts={ts_str}")
        # Show which would be picked per judge without running metrics
        if parquets:
            try:
                merged, inputs_meta = select_latest_per_judge(parquets)
            except Exception as exc:
                print(f"Selection failed: {exc}", file=sys.stderr)
                return 1
            present = sorted(inputs_meta["judges"].keys())
            missing = [j for j in EXPECTED_JUDGES if j not in present]
            print(f"Judges with usable rows: {present or 'NONE'}")
            if missing:
                print(
                    f"MISSING (will be omitted from report): {missing}. "
                    "Report will still be generated for the available judges."
                )
            for judge, prov in sorted(inputs_meta["judges"].items()):
                sources = prov.get("source_parquets", [])
                if sources:
                    src_str = ", ".join(
                        f"{Path(s['path']).name}={s['rows']}" for s in sources
                    )
                else:
                    src_str = "(no source)"
                print(f"  {judge}: {prov['rows']} rows from [{src_str}]")
        return 0

    if not parquets:
        print(
            f"ERROR: no judgments_*.parquet files found in {args.results_dir}",
            file=sys.stderr,
        )
        return 2

    merged, inputs_meta = select_latest_per_judge(parquets)
    if merged.empty:
        print("ERROR: no readable rows in any discovered parquet.", file=sys.stderr)
        return 2

    manifest = load_manifest(args.manifest)
    joined, join_diag = join_judgments_to_manifest(merged, manifest)
    if joined.empty:
        print(
            "ERROR: no judgment rows joined to the manifest. Check that "
            "baselinePath/defectPath in the parquet match the manifest paths.",
            file=sys.stderr,
        )
        return 2

    report = compute_report(
        joined,
        inputs_meta,
        join_diag,
        seed=args.seed,
        n_resamples=args.resamples,
    )

    args.output_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%SZ")
    json_path = args.output_dir / f"phase1_analysis_{ts}.json"
    md_path = args.output_dir / f"phase1_analysis_{ts}.md"

    json_path.write_text(
        json.dumps(report, indent=2, default=_json_default, sort_keys=True),
        encoding="utf-8",
    )
    md_path.write_text(render_markdown(report), encoding="utf-8")

    print(f"Wrote {json_path}")
    print(f"Wrote {md_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
