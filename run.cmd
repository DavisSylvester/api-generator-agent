@echo off
REM api-generator-agent — Foreground launcher
REM Runs until completion with no timeout
REM Usage: run.cmd --prd my-app.md --iterations 20

cd /d "%~dp0"
bun run src/index.mts %*
