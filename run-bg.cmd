@echo off
REM api-generator-agent — Background launcher
REM Runs in background. Telegram notifies every 5 min.
REM Usage: run-bg.cmd --prd my-app.md --iterations 20

cd /d "%~dp0"

if not exist .workspace mkdir .workspace

set TIMESTAMP=%date:~-4%%date:~3,2%%date:~0,2%-%time:~0,2%%time:~3,2%%time:~6,2%
set TIMESTAMP=%TIMESTAMP: =0%
set LOG=.workspace\run-%TIMESTAMP%.log

echo === api-generator-agent ===
echo Starting pipeline in background...
echo Log:      %LOG%
echo Telegram: updates every 5 min
echo.

start /B "api-generator-agent" bun run src/index.mts %* > %LOG% 2>&1

echo Pipeline is running in background.
echo.
echo Commands:
echo   Follow:  type %LOG%
echo   Status:  bun run src/index.mts --list-runs
echo   Stop:    taskkill /F /IM bun.exe
echo.
echo You can close this terminal.
