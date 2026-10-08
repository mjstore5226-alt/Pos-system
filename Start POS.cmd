@echo off
cd /d "%~dp0"
set "OPEN_BROWSER=1"
if exist "%~dp0runtime\node.exe" (
  "%~dp0runtime\node.exe" scripts\start-local.mjs
  if errorlevel 1 pause
  exit /b
)
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 24 LTS once, then double-click this file again.
  echo After installation this POS runs without internet.
  pause
  exit /b 1
)
node scripts\start-local.mjs
if errorlevel 1 pause
