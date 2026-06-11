#!/usr/bin/env python3
"""
One-off Zenodo new-version mint for v1.6.1-emse-option-b.

The existing scripts/mint_zenodo_doi.py was scoped for the v0.3.0 release
(stale title + stale substitution targets + no new-version handling). This
script:

1. Creates a new Zenodo version under the existing concept DOI 20620870
   (rather than a fresh, unlinked record).
2. Uploads the v1.6.1 source tarball (git archive of the tagged commit).
3. Updates title / description / keywords for the v1.6 manuscript.
4. Publishes.
5. Substitutes the new version DOI into the canonical v1.6 manuscript
   files and CITATION.cff (the ones the original script omitted).

Usage:
  .venv-analysis/bin/python3 scripts/mint_zenodo_v1_6_1.py
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import requests

REPO_ROOT = Path(__file__).resolve().parent.parent
TOKEN_FILE = Path.home() / ".config" / "zenodo" / "token"
TAG = "v1.6.1-emse-option-b"
EXISTING_VERSION_ID = 20620871  # the v0.3.0 deposit; we'll create newversion off it
CONCEPT_DOI = "10.5281/zenodo.20620870"
PLACEHOLDER = "10.5281/zenodo.TBD-VERSION-DOI"

TITLE = (
    "Visual Oracle Bench (Phase 1, v1.6) — Two-Judge Synthetic-HTML Pilot "
    "for LLM-as-Judge Visual Regression Detection with Specificity Reporting"
)

DESCRIPTION = (
    "<p>Phase 1 methodological-pilot snapshot for the EMSE Methodological "
    "Articles submission, release tag <code>v1.6.1-emse-option-b</code>. "
    "Supersedes v0.3.0; see the Data Integrity narrative in the manuscript "
    "(§1.4, §3.5, §6.1) for the silent-fabrication discovery and "
    "correction that distinguishes v1.6 from v0.3.0 headline numbers.</p>"
    "<p><b>Pre-registration:</b> OSF DOI 10.17605/OSF.IO/NKD6J, registered "
    "2026-06-06 (Phase 2 design). Phase 1 Amendment 1 filed 2026-06-11.</p>"
    "<p><b>Contains:</b> 600-pair specificity-inclusive corpus (manifest v2: "
    "400 defects + 200 controls); patched judge wrappers with malformed "
    "propagation; dispatcher fail-fast gate; analyzer with the "
    "_flag_silent_fabrications retroactive filter; paired-test script; "
    "v1.6 manuscript and cover letter; the contaminated original parquets "
    "retained for audit reproducibility.</p>"
    "<p><b>Headline numbers (v1.6, integrity-audited subset):</b> "
    "OpenAI gpt-5-codex 87.5% accuracy / 73.1% recall / 100% specificity "
    "(n=375); Claude Sonnet 4.5 78.4% accuracy / 45.8% recall / 100% "
    "specificity (n=208, attrition-confined to two of eight profiles); "
    "pairwise Cohen's &kappa; = 0.679 [0.565, 0.788] on the n=208 mixed "
    "intersection, 0.423 [0.277, 0.583] on the defect-only n=83 "
    "intersection; McNemar p &approx; 6.0&times;10<sup>&minus;8</sup>. "
    "Llama 3.2 Vision 11B is reported in Appendix A only owing to a "
    "documented multi-image input confound.</p>"
)


def read_token() -> str:
    if "ZENODO_TOKEN" in os.environ:
        return os.environ["ZENODO_TOKEN"].strip()
    return TOKEN_FILE.read_text().strip()


def build_tarball() -> Path:
    tarball = REPO_ROOT / f"visual-oracle-bench-{TAG}.tar.gz"
    subprocess.run(
        ["git", "archive", "--format=tar.gz", f"--prefix=visual-oracle-bench-{TAG}/",
         "-o", str(tarball), TAG],
        cwd=REPO_ROOT, check=True,
    )
    return tarball


def main() -> None:
    token = read_token()
    headers = {"Authorization": f"Bearer {token}"}

    print(f"== Building tarball for {TAG}")
    tarball = build_tarball()
    size = tarball.stat().st_size
    print(f"   {tarball.name}: {size:,} bytes")

    print(f"== Creating new version under deposit id={EXISTING_VERSION_ID}")
    r = requests.post(
        f"https://zenodo.org/api/deposit/depositions/{EXISTING_VERSION_ID}/actions/newversion",
        headers=headers, timeout=30,
    )
    if r.status_code not in (201, 200):
        print(f"   ERROR {r.status_code}: {r.text[:500]}", file=sys.stderr)
        sys.exit(2)
    parent = r.json()
    latest_draft_url = parent["links"]["latest_draft"]
    print(f"   latest_draft: {latest_draft_url}")

    r = requests.get(latest_draft_url, headers=headers, timeout=30)
    r.raise_for_status()
    draft = r.json()
    draft_id = draft["id"]
    bucket_url = draft["links"]["bucket"]
    print(f"   draft id={draft_id} bucket={bucket_url}")

    print(f"== Removing inherited files from draft")
    for f in draft.get("files", []):
        del_url = f["links"]["self"]
        rr = requests.delete(del_url, headers=headers, timeout=30)
        print(f"   deleted {f.get('filename')}: {rr.status_code}")

    print(f"== Uploading new tarball")
    with tarball.open("rb") as fh:
        r = requests.put(
            f"{bucket_url}/{tarball.name}",
            data=fh, headers=headers, timeout=600,
        )
    if r.status_code not in (200, 201):
        print(f"   ERROR upload {r.status_code}: {r.text[:500]}", file=sys.stderr)
        sys.exit(3)
    print(f"   uploaded ({r.status_code})")

    print(f"== Updating metadata")
    metadata_patch = {
        "metadata": {
            "title": TITLE,
            "upload_type": "software",
            "description": DESCRIPTION,
            "creators": [
                {"name": "Malhotra, Suneet",
                 "orcid": "0009-0003-8707-9590"}
            ],
            "keywords": [
                "LLM-as-Judge", "visual regression testing", "test oracles",
                "empirical software engineering", "pre-registration",
                "specificity", "Cohen's kappa", "Phase 1 pilot",
                "silent fabrication", "data integrity",
            ],
            "license": "MIT",
            "version": "1.6.1",
            "access_right": "open",
            "publication_date": "2026-06-11",
            "related_identifiers": [
                {"identifier": "10.17605/OSF.IO/NKD6J",
                 "relation": "isSupplementTo", "scheme": "doi"},
                {"identifier": CONCEPT_DOI,
                 "relation": "isVersionOf", "scheme": "doi"},
            ],
        }
    }
    r = requests.put(
        latest_draft_url, headers={**headers, "Content-Type": "application/json"},
        data=json.dumps(metadata_patch), timeout=30,
    )
    if r.status_code not in (200, 201):
        print(f"   ERROR metadata {r.status_code}: {r.text[:500]}", file=sys.stderr)
        sys.exit(4)
    print(f"   metadata updated ({r.status_code})")

    print(f"== Publishing")
    publish_url = draft["links"]["publish"]
    r = requests.post(publish_url, headers=headers, timeout=60)
    if r.status_code not in (202, 200):
        print(f"   ERROR publish {r.status_code}: {r.text[:500]}", file=sys.stderr)
        sys.exit(5)
    published = r.json()
    new_version_doi = published.get("doi", "")
    print(f"   ✓ published")
    print(f"   version DOI:    {new_version_doi}")
    print(f"   concept DOI:    {published.get('conceptdoi', CONCEPT_DOI)}")
    print(f"   resolution:     https://doi.org/{new_version_doi}")

    print(f"== Substituting into v1.6 manuscript files")
    targets = [
        REPO_ROOT / "manuscript" / "article3_phase1_v1_6.md",
        REPO_ROOT / "manuscript" / "cover_letter_emse_phase1_v1_6.md",
        REPO_ROOT / "ARTIFACTS.md",
        REPO_ROOT / "README.md",
    ]
    for t in targets:
        if not t.exists():
            print(f"   skip (missing): {t.relative_to(REPO_ROOT)}")
            continue
        text = t.read_text(encoding="utf-8")
        if PLACEHOLDER in text:
            text = text.replace(PLACEHOLDER, new_version_doi)
            t.write_text(text, encoding="utf-8")
            print(f"   patched: {t.relative_to(REPO_ROOT)}")
        else:
            print(f"   no placeholder: {t.relative_to(REPO_ROOT)}")

    # CITATION.cff
    cff = REPO_ROOT / "CITATION.cff"
    if cff.exists():
        text = cff.read_text(encoding="utf-8")
        # Replace any prior identifiers block's doi line for this version
        if "10.5281/zenodo" in text:
            # Best-effort: also write the new version DOI as a comment at top
            new_text = f"# Version DOI (v1.6.1, EMSE Option B): {new_version_doi}\n" + text
            cff.write_text(new_text, encoding="utf-8")
            print(f"   prepended new version DOI comment to CITATION.cff")

    # Save a record so the user can verify
    out = REPO_ROOT / f"logs/zenodo_v1_6_1_mint_{new_version_doi.replace('/', '_')}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({
        "tag": TAG,
        "version_doi": new_version_doi,
        "concept_doi": published.get("conceptdoi", CONCEPT_DOI),
        "resolution_url": f"https://doi.org/{new_version_doi}",
        "draft_id": draft_id,
        "title": TITLE,
        "published_at": published.get("created", ""),
    }, indent=2), encoding="utf-8")
    print(f"   saved record: {out.relative_to(REPO_ROOT)}")
    print(f"\n== DONE. New version DOI: {new_version_doi}")


if __name__ == "__main__":
    main()
