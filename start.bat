@echo off
rem prompt-graph launcher
rem NOTE: keep this file ASCII-only. cmd.exe parses .bat with the OEM codepage
rem (CP932 on Japanese Windows); UTF-8 multibyte chars break batch parsing.

setlocal
cd /d "%~dp0"

rem Some terminals (VS Code / integrated shells) set ELECTRON_RUN_AS_NODE=1,
rem which makes Electron run as plain Node and fail to open the window. Clear it.
set "ELECTRON_RUN_AS_NODE="

where npm >nul 2>nul
if errorlevel 1 (
  echo [prompt-graph] npm not found on PATH. Install Node.js 24.x first.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [prompt-graph] Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo [prompt-graph] npm install failed.
    pause
    exit /b 1
  )
)

echo [prompt-graph] Starting (Ctrl+C to quit)...
call npm run dev

if errorlevel 1 (
  echo [prompt-graph] Failed to start. See the messages above.
  pause
  exit /b 1
)

endlocal
