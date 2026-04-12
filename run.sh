#!/usr/bin/env bash
# api-generator-agent — Foreground launcher
# Runs until completion with no timeout
# Usage: ./run.sh --prd my-app.md --iterations 20

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

exec bun run src/index.mts "$@"
