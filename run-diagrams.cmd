@echo off
REM diagram-agent — Standalone launcher
REM Usage: run-diagrams.cmd <input-description.md> <output-dir>

set DIAGRAM_AGENT_DIR=C:\projects\davis\agents\diagram-agent

if not exist "%DIAGRAM_AGENT_DIR%" (
  echo Error: diagram-agent not found at %DIAGRAM_AGENT_DIR%
  exit /b 1
)

cd /d "%DIAGRAM_AGENT_DIR%"
bun run src/index.mts %*
