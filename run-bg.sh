#!/usr/bin/env bash
# api-generator-agent — Background launcher
# Runs in background with nohup. Telegram notifies every 5 min.
# Usage: ./run-bg.sh --prd my-app.md --iterations 20

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

mkdir -p .workspace

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
LOG=".workspace/run-${TIMESTAMP}.log"

echo "=== api-generator-agent ==="
echo "Starting pipeline in background..."
echo "Log:      $LOG"
echo "Telegram: updates every 5 min"
echo ""

nohup bun run src/index.mts "$@" > "$LOG" 2>&1 &
PID=$!

echo "$PID" > .workspace/.pipeline.pid
echo "PID:      $PID"
echo ""
echo "Commands:"
echo "  Follow:  tail -f $LOG"
echo "  Status:  bun run src/index.mts --list-runs"
echo "  Stop:    kill $PID"
echo ""
echo "Pipeline is running. You can close this terminal."
