#!/usr/bin/env bash
# scripts/launch_full_dispatch_2026-06-11.sh
#
# Launch the full 600-pair Phase 1 re-dispatch (Claude + Codex, no Llama)
# after the 2026-06-10 silent-fabrication discovery + judge-wrapper fixes.
#
# Uses /bin/bash explicitly and full paths to avoid the user's
# `alias grep="rg"` from interfering with anything. Detaches via
# nohup + `&` and writes the PID to logs/dispatch_full_2026-06-11.pid
# so it can be monitored without invoking pgrep/grep at all.
#
# Usage:
#   bash scripts/launch_full_dispatch_2026-06-11.sh
#
# Monitor:
#   tail -f ~/work/visual-oracle-bench/logs/dispatch_full_2026-06-11.log
#
# Kill (if needed):
#   kill "$(cat ~/work/visual-oracle-bench/logs/dispatch_full_2026-06-11.pid)"

set -u
REPO="$HOME/work/visual-oracle-bench"
LOG="$REPO/logs/dispatch_full_2026-06-11.log"
PID_FILE="$REPO/logs/dispatch_full_2026-06-11.pid"

cd "$REPO" || { echo "ERROR: cannot cd to $REPO"; exit 1; }
mkdir -p logs

# If a previous dispatch is still alive, refuse to start a second one.
if [[ -f "$PID_FILE" ]]; then
  OLD_PID="$(cat "$PID_FILE")"
  if [[ -n "$OLD_PID" ]] && /bin/ps -p "$OLD_PID" >/dev/null 2>&1; then
    echo "ERROR: dispatch already running as PID $OLD_PID"
    echo "  log:  $LOG"
    echo "  to stop it: kill $OLD_PID"
    exit 2
  fi
  # Stale PID file — clean up
  /bin/rm -f "$PID_FILE"
fi

echo "Launching full 600-pair dispatch ..."
echo "  pairs:       $REPO/data/images/_pairs_manifest_v2.json"
echo "  judges:      claude-oauth,openai-codex"
echo "  concurrency: 2  (paces against Claude per-hour rate limit)"
echo "  fail-fast:   abort if malformed rate > 25% in first 20 judgments"
echo "  log:         $LOG"

# Run in background, detach from terminal, capture PID for monitoring.
nohup /usr/bin/env npx tsx oracles/llm_judge/dispatcher.ts \
  --pairs data/images/_pairs_manifest_v2.json \
  --judges claude-oauth,openai-codex \
  --concurrency 2 \
  --out-dir results \
  > "$LOG" 2>&1 &

DISPATCH_PID="$!"
echo "$DISPATCH_PID" > "$PID_FILE"

# Give nohup a beat to actually exec the node process.
sleep 2

if /bin/ps -p "$DISPATCH_PID" >/dev/null 2>&1; then
  echo ""
  echo "✓ dispatcher launched OK"
  echo "  PID:        $DISPATCH_PID"
  echo "  PID file:   $PID_FILE"
  echo ""
  echo "Monitor with:    tail -f $LOG"
  echo "Stop with:       kill $DISPATCH_PID"
  echo ""
  echo "Expect ~3–4 hours wall clock for 1,200 judgments at concurrency 2."
  echo "First proof-of-life in the log is the line:"
  echo "    [dispatcher] fail-fast gate: after 20 judgments per judge, abort if malformed-after-retry rate > 25%"
else
  echo ""
  echo "ERROR: dispatcher exited within 2 seconds of launch."
  echo "Tail of log:"
  /usr/bin/tail -50 "$LOG"
  /bin/rm -f "$PID_FILE"
  exit 3
fi
