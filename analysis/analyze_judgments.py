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
MANIFEST_PATH = REPO_ROOT / "data" / "images" / "_pairs_manifest.json"

PARQUET_GLOB = "judgments_*.parquet"
# Filename embeds the dispatcher start timestamp in this format:
#   judgments_2026-06-07T02-50-09-790Z.parquet
TIMESTAMP_RE = re.compile(
    r"judgments_(?P<ts>\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)\.parquet$"
)

VERDICT_CATEGORIES = ["fail", "pass"]  # binary verdict universe
GROUND_TRUTH = "fail"  # by manifest construction (see docstring)


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
    Read all parquets and return a merged DataFrame containing, for each
    judgeName, only the rows from the latest-timestamped parquet that has
    that judge. Also returns a per-judge provenance dict for reporting.
    """
    # judgeName -> (timestamp, source_path, rows_df)
    latest_for_judge: Dict[str, Tuple[datetime, Path, pd.DataFrame]] = {}

    file_summary: List[Dict[str, object]] = []

    for path, ts in parquets:
        try:
            df = pq.read_table(path).to_pandas()
        except Exception as exc:  # surface, don't swallow
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
            }
        )

        # A parquet with no parseable timestamp is sorted last; treat its ts as
        # "the floor" so that it only wins if nothing else covers that judge.
        effective_ts = ts or datetime.min.replace(tzinfo=timezone.utc)

        for judge, sub in df.groupby("judgeName"):
            prior = latest_for_judge.get(judge)
            if prior is None or effective_ts > prior[0]:
                latest_for_judge[judge] = (effective_ts, path, sub.reset_index(drop=True))

    # Mark which file ended up being used for each judge.
    chosen_paths: Dict[str, Path] = {j: t[1] for j, t in latest_for_judge.items()}
    for entry in file_summary:
        used = [j for j, p in chosen_paths.items() if str(p) == entry["path"]]
        entry["used_for_judges"] = sorted(used)

    if not latest_for_judge:
        return pd.DataFrame(), {"files": file_summary, "judges": {}}

    merged = pd.concat(
        [t[2] for t in latest_for_judge.values()], ignore_index=True
    )

    judge_provenance: Dict[str, Dict[str, object]] = {}
    for judge, (ts, path, sub) in latest_for_judge.items():
        judge_provenance[judge] = {
            "source_parquet": str(path),
            "source_timestamp": ts.isoformat() if ts != datetime.min.replace(tzinfo=timezone.utc) else None,
            "rows": int(len(sub)),
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
        rows.append(
            {
                "baselinePath": entry["baseline"],
                "defectPath": entry["defect"],
                "app": entry["app"],
                "defect_id": entry["defect_id"],
                "manifest_category": entry["category"],
                "surface": entry["surface"],
            }
        )
    df = pd.DataFrame(rows)
    if df.duplicated(subset=["baselinePath", "defectPath"]).any():
        dups = df[df.duplicated(subset=["baselinePath", "defectPath"], keep=False)]
        raise ValueError(
            f"Manifest has duplicate (baseline,defect) pairs:\n{dups.head()}"
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
    matched["ground_truth"] = GROUND_TRUTH
    diagnostics = {
        "judgment_rows_total": int(before),
        "judgment_rows_matched": int(len(matched)),
        "judgment_rows_unmatched": unmatched,
        "manifest_pairs_total": int(len(manifest)),
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
    """For each judge, compute: n_total, n_valid, n_malformed, n_invalid_verdict,
    accuracy (=recall vs all-fail GT), precision (=None, undefined)."""
    out: Dict[str, Dict[str, object]] = {}
    for judge, sub in df.groupby("judgeName"):
        n_total = len(sub)
        malformed_mask = sub["malformed"].astype(bool)
        verdict_in_set = sub["verdict"].isin(VERDICT_CATEGORIES)
        valid_mask = (~malformed_mask) & verdict_in_set
        n_malformed = int(malformed_mask.sum())
        n_invalid = int(((~malformed_mask) & (~verdict_in_set)).sum())
        n_valid = int(valid_mask.sum())

        if n_valid > 0:
            preds = sub.loc[valid_mask, "verdict"]
            n_fail = int((preds == "fail").sum())
            accuracy = n_fail / n_valid
        else:
            n_fail = 0
            accuracy = float("nan")

        out[judge] = {
            "n_total": int(n_total),
            "n_valid": n_valid,
            "n_malformed": n_malformed,
            "n_invalid_verdict": n_invalid,
            "n_predicted_fail": n_fail,
            "n_predicted_pass": n_valid - n_fail,
            "accuracy_vs_truth": accuracy,
            "recall_vs_truth": accuracy,  # same thing when GT is all-fail
            "precision_vs_truth": None,    # undefined: no true negatives
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
    df: pd.DataFrame, group_col: str
) -> Dict[str, Dict[str, Dict[str, float]]]:
    """
    Returns {judge: {group_value: {"n_valid": int, "n_fail": int, "accuracy": float}}}.
    Uses only rows where verdict is valid (not malformed, in {fail, pass}).
    """
    out: Dict[str, Dict[str, Dict[str, float]]] = {}
    valid = df[
        (~df["malformed"].astype(bool)) & df["verdict"].isin(VERDICT_CATEGORIES)
    ]
    for judge, sub_j in valid.groupby("judgeName"):
        per_group: Dict[str, Dict[str, float]] = {}
        for grp, sub_g in sub_j.groupby(group_col):
            n_valid = int(len(sub_g))
            n_fail = int((sub_g["verdict"] == "fail").sum())
            per_group[str(grp)] = {
                "n_valid": n_valid,
                "n_fail": n_fail,
                "accuracy": (n_fail / n_valid) if n_valid else float("nan"),
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
    lines.append(
        "Ground-truth assumption: every pair in `data/images/_pairs_manifest.json` "
        "is a baseline-vs-defect pair where a defect was injected. The "
        "ground-truth verdict for every pair is therefore `'fail'`. "
        "Precision is undefined without negative examples and is reported as `n/a`; "
        "accuracy and recall coincide.\n"
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

    # ---- Per-judge accuracy
    lines.append("## Per-judge accuracy vs ground truth\n")
    lines.append("Ground truth = `fail` for all pairs (manifest construction). "
                 "`accuracy` = `recall` = fraction of valid verdicts that were `fail`. "
                 "`precision` is undefined (no true negatives).\n")
    lines.append("| Judge | n_total | n_valid | n_fail | n_pass | accuracy / recall | precision |")
    lines.append("|---|---:|---:|---:|---:|---:|---:|")
    for judge in sorted(report["per_judge_classification"].keys()):
        c = report["per_judge_classification"][judge]
        lines.append(
            f"| `{judge}` | {c['n_total']} | {c['n_valid']} | "
            f"{c['n_predicted_fail']} | {c['n_predicted_pass']} | "
            f"{fmt_pct(c['accuracy_vs_truth'])} | n/a |"
        )
    lines.append("")

    # ---- Pairwise kappa
    lines.append("## Inter-judge agreement (Cohen's kappa)\n")
    lines.append("Pairwise nominal kappa over `{fail, pass}` on the intersection "
                 "of pairs both judges produced a valid verdict for. CIs are "
                 "percentile bootstrap over pair indices.\n")
    lines.append("| Judge A | Judge B | n_pairs | kappa | 95% CI | Landis-Koch |")
    lines.append("|---|---|---:|---:|---|---|")
    for entry in report["pairwise_cohen_kappa"]:
        ci_lo, ci_hi = entry["ci95"]
        ci_str = "n/a" if not (np.isfinite(ci_lo) and np.isfinite(ci_hi)) else f"[{ci_lo:.3f}, {ci_hi:.3f}]"
        lines.append(
            f"| `{entry['judge_a']}` | `{entry['judge_b']}` | "
            f"{entry['n_pairs']} | {fmt_k(entry['kappa'])} | {ci_str} | "
            f"{landis_koch(entry['kappa'])} |"
        )
    lines.append("")

    fk = report["fleiss_kappa"]
    if fk["n_subjects"] > 0:
        ci_lo, ci_hi = fk["ci95"]
        ci_str = "n/a" if not (np.isfinite(ci_lo) and np.isfinite(ci_hi)) else f"[{ci_lo:.3f}, {ci_hi:.3f}]"
        lines.append(
            f"**Fleiss' kappa across {', '.join(fk['judges'])} "
            f"(n_subjects = {fk['n_subjects']}, k = {fk['n_categories']}): "
            f"{fmt_k(fk['kappa'])}** — 95% CI {ci_str} ({landis_koch(fk['kappa'])}).\n"
        )
    else:
        lines.append("**Fleiss' kappa:** n/a (no pair had a valid verdict from every judge).\n")

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

    # ---- Per-category breakdown
    lines.append("## Per-category breakdown\n")
    cat_judges = sorted(report["per_category_accuracy"].keys())
    cats = sorted({c for j in cat_judges for c in report["per_category_accuracy"][j].keys()})
    header = "| Category | " + " | ".join(f"`{j}` accuracy (n)" for j in cat_judges) + " |"
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
                cells.append(f"{fmt_pct(cell['accuracy'])} ({cell['n_valid']})")
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

    # Pairwise Cohen
    judges = sorted(df["judgeName"].unique().tolist())
    pairwise: List[Dict[str, object]] = []
    for i, ja in enumerate(judges):
        for jb in judges[i + 1 :]:
            a, b, n = build_paired_matrix(df, ja, jb)
            if n == 0:
                pairwise.append(
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
            pairwise.append(
                {
                    "judge_a": ja,
                    "judge_b": jb,
                    "n_pairs": n,
                    "kappa": point,
                    "ci95": [lo, hi],
                }
            )

    # Fleiss across all judges
    fleiss_judges = judges
    fleiss_mat, fleiss_pairs = build_fleiss_matrix(df, fleiss_judges)
    if fleiss_mat.shape[0] == 0:
        fleiss_block = {
            "judges": fleiss_judges,
            "n_subjects": 0,
            "n_categories": len(VERDICT_CATEGORIES),
            "kappa": float("nan"),
            "ci95": [float("nan"), float("nan")],
        }
    else:
        point = fleiss_kappa(fleiss_mat)

        def est_fleiss(idx: np.ndarray, _m=fleiss_mat) -> float:
            return fleiss_kappa(_m[idx])

        _, lo, hi = bootstrap_ci(est_fleiss, fleiss_mat.shape[0], n_resamples, rng)
        fleiss_block = {
            "judges": fleiss_judges,
            "n_subjects": int(fleiss_mat.shape[0]),
            "n_categories": int(fleiss_mat.shape[1]),
            "kappa": point,
            "ci95": [lo, hi],
        }

    # Breakdowns
    per_app = accuracy_breakdown(df, "app")
    per_cat = accuracy_breakdown(df, "manifest_category")
    latency = latency_stats(df)
    cost = cost_stats(df)
    failures = failure_mode_stats(df)

    # TL;DR
    acc_bits = []
    for judge in sorted(per_judge.keys()):
        acc = per_judge[judge]["accuracy_vs_truth"]
        acc_bits.append(f"`{judge}` {fmt_pct(acc)} (n_valid={per_judge[judge]['n_valid']})")
    pairwise_bits = []
    for entry in pairwise:
        if entry["n_pairs"] == 0:
            continue
        pairwise_bits.append(
            f"`{entry['judge_a']}`/`{entry['judge_b']}` kappa={fmt_k(entry['kappa'])} "
            f"(n={entry['n_pairs']})"
        )
    fleiss_str = ""
    if fleiss_block["n_subjects"] > 0:
        fleiss_str = (
            f" Fleiss' kappa across {len(fleiss_block['judges'])} judges = "
            f"{fmt_k(fleiss_block['kappa'])} on n={fleiss_block['n_subjects']} subjects."
        )
    tldr = (
        "Accuracy vs all-fail ground truth: " + "; ".join(acc_bits) + ". "
        "Pairwise agreement: " + ("; ".join(pairwise_bits) if pairwise_bits else "n/a")
        + "." + fleiss_str
    )

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "bootstrap_seed": seed,
        "bootstrap_resamples": n_resamples,
        "ground_truth_assumption": (
            "Every pair in data/images/_pairs_manifest.json is a baseline-vs-defect "
            "pair with a defect injected; ground_truth = 'fail' for all pairs. "
            "Precision is undefined without negatives."
        ),
        "expected_judges": EXPECTED_JUDGES,
        "data_inputs": inputs_meta,
        "manifest_join": manifest_join_diag,
        "tldr": tldr,
        "per_judge_classification": per_judge,
        "pairwise_cohen_kappa": pairwise,
        "fleiss_kappa": fleiss_block,
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
                print(
                    f"  {judge}: {prov['rows']} rows from "
                    f"{Path(prov['source_parquet']).name} (ts={prov['source_timestamp']})"
                )
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
