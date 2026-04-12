#!/usr/bin/env bash
# diagram-agent — Standalone launcher
# Usage: ./run-diagrams.sh <input-description.md> <output-dir>

DIAGRAM_AGENT_DIR="C:/projects/davis/agents/diagram-agent"

if [ ! -d "$DIAGRAM_AGENT_DIR" ]; then
  echo "Error: diagram-agent not found at $DIAGRAM_AGENT_DIR"
  exit 1
fi

cd "$DIAGRAM_AGENT_DIR"
exec bun run src/index.mts "$@"
