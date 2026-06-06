#!/usr/bin/env bash
# scripts/run_w2_validation.sh
#
# W2 validation: install toolchain, run primitive unit tests, run offline
# pipeline smoke. Does NOT require Docker. Use this on any contributor laptop
# to confirm the injection pipeline is healthy before committing changes.
#
# For the Docker-dependent Conduit smoke, see apps/conduit/RUNBOOK.md.

set -euo pipefail
cd "$(dirname "$0")/.."

echo "[w2-validate] installing npm deps ..."
npm install --no-audit --no-fund

echo "[w2-validate] installing Playwright chromium ..."
npx playwright install chromium

echo "[w2-validate] unit tests for 6 injection primitives ..."
npx tsx tests/test_primitives_unit.ts

echo "[w2-validate] offline pipeline smoke (12 PNGs) ..."
npx tsx tests/smoke_offline_pipeline.ts

echo "[w2-validate] OK"
echo "  unit-test outputs: stdout only"
echo "  offline-smoke PNGs: data/images/_offline_smoke/"
