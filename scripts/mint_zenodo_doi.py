#!/usr/bin/env python3
"""
scripts/mint_zenodo_doi.py

Mint a Zenodo DOI for the current repo snapshot via the Zenodo REST API.
No browser required after one-time token setup.

ONE-TIME SETUP (~2 min in browser):
  1. https://zenodo.org/account/settings/applications/tokens/new/
  2. Name: "visual-oracle-bench-mint"
  3. Scopes: deposit:write + deposit:actions (check both)
  4. Click Create
  5. Copy the token (long alphanumeric string)
  6. Save:
       mkdir -p ~/.config/zenodo
       echo "<paste-token-here>" > ~/.config/zenodo/token
       chmod 600 ~/.config/zenodo/token

USAGE:
  # Dry run (build tarball, print metadata, don't publish):
  .venv-analysis/bin/python3 scripts/mint_zenodo_doi.py --dry-run

  # Real mint:
  .venv-analysis/bin/python3 scripts/mint_zenodo_doi.py --substitute

  # Test on sandbox first (safer; ~5 min round-trip):
  .venv-analysis/bin/python3 scripts/mint_zenodo_doi.py --sandbox
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tarfile
from pathlib import Path
from typing import Any

try:
    import requests
except ImportError:
    sys.stderr.write("requests not installed. Run: .venv-analysis/bin/pip install requests\n")
    sys.exit(1)


REPO_ROOT = Path(__file__).resolve().parent.parent
TOKEN_FILE = Path.home() / ".config" / "zenodo" / "token"
ZENODO_BASE = "https://zenodo.org/api"
ZENODO_SANDBOX = "https://sandbox.zenodo.org/api"

DEFAULT_EXCLUDES = {
    ".git",
    "node_modules",
    ".venv-analysis",
    "dist",
    "build",
    "playwright-report",
    "test-results",
    "logs",
    "data/images",  # 800 PNGs ~ 200MB; reviewers get them via GitHub release tag
}


def read_token(token_arg: str | None) -> str:
    if token_arg:
        return token_arg.strip()
    env = os.environ.get("ZENODO_TOKEN")
    if env:
        return env.strip()
    if TOKEN_FILE.exists():
        return TOKEN_FILE.read_text().strip()
    raise RuntimeError(
        "No Zenodo token found.\n"
        "  Option A: export ZENODO_TOKEN=<token>\n"
        f"  Option B: mkdir -p {TOKEN_FILE.parent} && echo '<token>' > {TOKEN_FILE} && chmod 600 {TOKEN_FILE}\n"
        "See the script docstring for one-time setup steps."
    )


def api_base(sandbox: bool) -> str:
    return ZENODO_SANDBOX if sandbox else ZENODO_BASE


def ping(token: str, base: str) -> None:
    r = requests.get(
        f"{base}/deposit/depositions",
        params={"access_token": token, "size": 1},
        timeout=15,
    )
    if r.status_code == 401:
        raise RuntimeError("Zenodo 401 Unauthorized — token invalid or expired or wrong endpoint (sandbox vs prod)")
    if not r.ok:
        raise RuntimeError(f"Zenodo ping failed: {r.status_code} {r.text[:300]}")
    print(f"  Token valid ({base})")


def find_existing(token: str, base: str, title: str) -> dict[str, Any] | None:
    r = requests.get(
        f"{base}/deposit/depositions",
        params={"access_token": token, "size": 25},
        timeout=15,
    )
    if not r.ok:
        return None
    for d in r.json():
        if d.get("title", "") == title or d.get("metadata", {}).get("title", "") == title:
            return d
    return None


def create_deposition(token: str, base: str) -> dict[str, Any]:
    r = requests.post(
        f"{base}/deposit/depositions",
        params={"access_token": token},
        json={},
        timeout=30,
    )
    if not r.ok:
        raise RuntimeError(f"Create deposition failed: {r.status_code} {r.text[:500]}")
    d = r.json()
    print(f"  Created deposition id={d['id']}")
    return d


def package_tarball(out_path: Path, version_tag: str) -> int:
    if out_path.exists():
        out_path.unlink()

    def is_excluded(rel_path: Path) -> bool:
        s = str(rel_path)
        for ex in DEFAULT_EXCLUDES:
            if s == ex or s.startswith(ex + "/"):
                return True
        return False

    n_added = 0
    with tarfile.open(out_path, "w:gz") as tf:
        for path in sorted(REPO_ROOT.rglob("*")):
            if not path.is_file():
                continue
            try:
                rel = path.relative_to(REPO_ROOT)
            except ValueError:
                continue
            if is_excluded(rel):
                continue
            if path.name.startswith(".") and path.name not in (".gitignore", ".gitattributes"):
                continue
            arcname = f"visual-oracle-bench-{version_tag}/{rel}"
            tf.add(str(path), arcname=arcname)
            n_added += 1
    return n_added


def upload_file(token: str, bucket_url: str, file_path: Path) -> None:
    with file_path.open("rb") as f:
        r = requests.put(
            f"{bucket_url}/{file_path.name}",
            params={"access_token": token},
            data=f,
            timeout=600,
        )
    if not r.ok:
        raise RuntimeError(f"Upload failed for {file_path.name}: {r.status_code} {r.text[:300]}")
    size = file_path.stat().st_size
    print(f"  Uploaded {file_path.name} ({size:,} bytes)")


def build_metadata(title: str, version_tag: str, description: str) -> dict[str, Any]:
    return {
        "metadata": {
            "title": title,
            "upload_type": "software",
            "description": description,
            "creators": [
                {
                    "name": "Malhotra, Suneet",
                    "affiliation": (
                        "Independent researcher in software quality engineering; "
                        "Senior Manager, Test Engineering at Motorola Solutions "
                        "(affiliation for identification only)"
                    ),
                    "orcid": "0009-0003-8707-9590",
                }
            ],
            "license": "MIT",
            "access_right": "open",
            "keywords": [
                "LLM-as-Judge",
                "software testing",
                "visual regression",
                "empirical software engineering",
                "pre-registration",
                "reproducibility",
                "methodological pilot",
                "benchmark",
            ],
            "related_identifiers": [
                {
                    "identifier": "10.17605/OSF.IO/NKD6J",
                    "relation": "isSupplementTo",
                    "resource_type": "publication-preprint",
                    "scheme": "doi",
                },
                {
                    "identifier": (
                        "https://github.com/SuneetMalhotra/visual-oracle-bench/"
                        f"releases/tag/{version_tag}"
                    ),
                    "relation": "isSupplementTo",
                    "resource_type": "software",
                    "scheme": "url",
                },
            ],
            "version": version_tag,
            "language": "eng",
            "notes": (
                "Data files in the deposit are licensed under CC-BY 4.0 "
                "(see LICENSE-DATA in the repository). Code files are MIT. "
                "The 800-PNG image corpus is hosted on the GitHub release "
                "(release tag in related_identifiers) rather than in this "
                "Zenodo tarball to keep deposit size manageable."
            ),
        }
    }


def update_metadata(token: str, base: str, deposition_id: int, metadata: dict) -> None:
    r = requests.put(
        f"{base}/deposit/depositions/{deposition_id}",
        params={"access_token": token},
        json=metadata,
        timeout=30,
    )
    if not r.ok:
        raise RuntimeError(f"Metadata update failed: {r.status_code} {r.text[:500]}")
    print(f"  Metadata set")


def publish(token: str, base: str, deposition_id: int) -> dict[str, Any]:
    r = requests.post(
        f"{base}/deposit/depositions/{deposition_id}/actions/publish",
        params={"access_token": token},
        timeout=60,
    )
    if not r.ok:
        raise RuntimeError(f"Publish failed: {r.status_code} {r.text[:500]}")
    d = r.json()
    print(f"  Published: DOI = {d.get('doi')}")
    return d


def substitute_in_file(path: Path, version_doi: str, concept_doi: str) -> bool:
    if not path.exists():
        return False
    original = path.read_text()
    content = original
    for ph in [
        "10.5281/zenodo.<ZENODO_ID>",
        "10.5281/zenodo.<version_id>",
        "10.5281/zenodo.<concept_id>",
        "[Zenodo DOI to be minted at submission]",
        "[Zenodo DOI to be minted]",
        "Zenodo DOI to be minted at submission",
        "Zenodo DOI: to be minted",
    ]:
        content = content.replace(ph, version_doi)
    content = re.sub(
        r"Zenodo concept DOI \[?10\.5281/zenodo\.\d+\]?",
        f"Zenodo concept DOI {concept_doi}",
        content,
    )
    if content != original:
        path.write_text(content)
        return True
    return False


def write_citation_cff(citation_path: Path, version_doi: str, concept_doi: str) -> None:
    if not citation_path.exists():
        citation_path.write_text(
            f"""cff-version: 1.2.0
message: "If you use this software, please cite it as below."
authors:
  - family-names: Malhotra
    given-names: Suneet
    orcid: "https://orcid.org/0009-0003-8707-9590"
title: "Visual Oracle Bench: A Pre-Registered Methodological Pilot for Multi-Application LLM-as-Judge Visual Regression Detection"
version: "v0.3.0-phase1-pilot"
date-released: 2026-06-10
url: "https://github.com/SuneetMalhotra/visual-oracle-bench"
identifiers:
  - type: doi
    value: {version_doi}
    description: "Version DOI for v0.3.0-phase1-pilot"
  - type: doi
    value: {concept_doi}
    description: "Concept DOI (resolves to latest version)"
  - type: doi
    value: 10.17605/OSF.IO/NKD6J
    description: "OSF pre-registration (registered 2026-06-06)"
license: MIT
"""
        )
        print(f"  Created CITATION.cff with Zenodo DOIs")
        return
    existing = citation_path.read_text()
    if version_doi not in existing:
        appended = existing.rstrip() + (
            "\n# Zenodo DOIs auto-appended by mint_zenodo_doi.py\n"
            f"# Version DOI: {version_doi}\n"
            f"# Concept DOI: {concept_doi}\n"
        )
        citation_path.write_text(appended)
        print(f"  Appended Zenodo DOIs to CITATION.cff")


def _substitute(version_doi: str, concept_doi: str) -> None:
    targets = [
        REPO_ROOT / "manuscript" / "article3_phase1_v1.md",
        REPO_ROOT / "manuscript" / "sections" / "04_results.md",
        REPO_ROOT / "ARTIFACTS.md",
        REPO_ROOT / "README.md",
    ]
    for t in targets:
        rel = t.relative_to(REPO_ROOT)
        if substitute_in_file(t, version_doi, concept_doi):
            print(f"  patched {rel}")
        else:
            print(f"  no placeholder in {rel}")
    write_citation_cff(REPO_ROOT / "CITATION.cff", version_doi, concept_doi)


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--token", help="Zenodo API token (else env or token file)")
    p.add_argument("--tag", default="v0.3.0-phase1-pilot", help="Release tag")
    p.add_argument(
        "--title",
        default="Visual Oracle Bench v0.3.0 — Phase 1 Methodological Pilot",
    )
    p.add_argument("--sandbox", action="store_true", help="Use Zenodo Sandbox for testing")
    p.add_argument("--substitute", action="store_true", help="After mint, patch DOI into manuscript files")
    p.add_argument("--dry-run", action="store_true", help="Build tarball + show metadata; do not publish")
    args = p.parse_args()

    print("=" * 60)
    print("Zenodo DOI minter — Visual Oracle Bench Phase 1")
    print("=" * 60)
    token = read_token(args.token)
    base = api_base(args.sandbox)
    print(f"Endpoint: {base}")
    print(f"Tag:      {args.tag}")
    print(f"Title:    {args.title}")
    print()

    print("Step 1: Verify token")
    ping(token, base)
    print()

    print("Step 2: Check for existing deposition with same title")
    existing = find_existing(token, base, args.title)
    if existing:
        state = existing.get("state", existing.get("submitted", "unknown"))
        print(f"  Found existing deposition id={existing['id']} state={state}")
        if state == "done":
            doi = existing.get("doi", "")
            concept = existing.get("conceptdoi", "")
            print(f"  Already published: DOI = {doi} / Concept = {concept}")
            if args.substitute:
                _substitute(doi, concept)
            return
        else:
            print("  Existing draft. Refusing to create duplicate. Delete on zenodo.org or use different --title.")
            sys.exit(2)
    else:
        print("  None found — proceeding to create new deposition")
    print()

    print("Step 3: Package repo tarball")
    tarball = REPO_ROOT / f"visual-oracle-bench-{args.tag}.tar.gz"
    n_files = package_tarball(tarball, args.tag)
    print(f"  Tarball at {tarball} ({tarball.stat().st_size:,} bytes, {n_files} files)")
    print()

    description = (
        f"<p>Phase 1 methodological pilot snapshot for the EMSE Methodological "
        f"Articles submission. Release tag <code>{args.tag}</code>.</p>"
        "<p><b>Pre-registration:</b> OSF DOI 10.17605/OSF.IO/NKD6J, registered "
        "2026-06-06, prior to any LLM judgment collection.</p>"
        "<p><b>Contains:</b> benchmark harness (injection primitives, capture "
        "orchestrator, dispatcher, 3 pre-registered LLM judges); W8 analysis "
        "pipeline + outputs; Phase 1 manuscript draft; reproducibility manifest "
        "(ARTIFACTS.md); pre-registration text.</p>"
        "<p><b>Headline Phase 1 numbers</b> (reproducible from "
        "analysis/results/phase1_analysis_*.md): Claude Sonnet 4.5 accuracy 88.8% "
        "(n=400); OpenAI gpt-5-codex 88.2% (n=400); Llama 3.2 Vision 11B 0.0% "
        "(n=400, all 'pass'); Claude × Codex Cohen's κ = 0.361 [95% CI 0.219, "
        "0.499]; Fleiss' κ across 3 judges = -0.309 [95% CI -0.350, -0.265]. "
        "All judges $0 marginal cost (subscription + local paths).</p>"
        "<p><b>License:</b> MIT (code), CC-BY 4.0 (data).</p>"
    )

    metadata = build_metadata(args.title, args.tag, description)

    if args.dry_run:
        print("Step 4: DRY-RUN — would create deposition with metadata:")
        print(json.dumps(metadata, indent=2)[:1500])
        print("...")
        print()
        print("Step 5+: DRY-RUN — would upload, set metadata, publish")
        print("=" * 60)
        print("DRY RUN COMPLETE — no Zenodo deposition created")
        return

    print("Step 4: Create empty deposition")
    deposition = create_deposition(token, base)
    deposition_id = deposition["id"]
    bucket_url = deposition["links"]["bucket"]
    print()

    print("Step 5: Upload tarball")
    upload_file(token, bucket_url, tarball)
    print()

    print("Step 6: Set metadata")
    update_metadata(token, base, deposition_id, metadata)
    print()

    print("Step 7: Publish")
    published = publish(token, base, deposition_id)
    version_doi = published.get("doi", "")
    concept_doi = published.get("conceptdoi", "")
    record_url = (
        published.get("links", {}).get("html")
        or published.get("links", {}).get("record_html")
        or f"https://doi.org/{version_doi}"
    )
    print()

    print("=" * 60)
    print("ZENODO DOI MINTED")
    print(f"  Version DOI:    {version_doi}")
    print(f"  Concept DOI:    {concept_doi}")
    print(f"  Record URL:     {record_url}")
    print(f"  Resolution URL: https://doi.org/{version_doi}")
    print("=" * 60)

    if args.substitute:
        print()
        print("Step 8: Substitute DOI into manuscript + ARTIFACTS + CITATION.cff")
        _substitute(version_doi, concept_doi)

    print()
    print("Next: re-run ./scripts/verify_submission_ready.sh — expect 32/32 PASS")


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as e:
        sys.stderr.write(f"ERROR: {e}\n")
        sys.exit(1)
