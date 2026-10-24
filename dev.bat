@echo off
setlocal
cd /d "%~dp0"
chcp 65001 >nul

title Fees - dev (all services)

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install Node 20+ from https://nodejs.org and try again.
  pause
  exit /b 1
)

if not exist "backend\.env" (
  echo [!] backend\.env is missing.
  echo     copy backend\.env.example backend\.env
  echo     then set APPWRITE_API_KEY in backend\.env
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing workspace dependencies...
  call npm install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)

echo.
echo Starting backend, frontend and payment gateway in this window...
echo.

node scripts\dev.mjs %*
set "DEV_EXIT=%ERRORLEVEL%"

if not "%DEV_EXIT%"=="0" (
  echo.
  echo Dev session ended with exit code %DEV_EXIT%.
  pause
)

exit /b %DEV_EXIT%
