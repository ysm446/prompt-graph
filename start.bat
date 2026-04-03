@echo off
setlocal

cd /d "%~dp0"

if not exist "node_modules" (
  echo [Graph Chat] Installing npm dependencies...
  call npm install
  if errorlevel 1 goto :fail
)

echo [Graph Chat] Rebuilding native modules for Electron...
call npm run rebuild:electron
if errorlevel 1 goto :fail

echo [Graph Chat] Starting app...
call npm run dev
if errorlevel 1 goto :fail

goto :eof

:fail
echo.
echo [Graph Chat] Startup failed.
exit /b 1
