@echo off
cd /d "%~dp0"

echo Starting backend (embedded PGlite dev database)...
start "Backend" cmd /c "npm run dev --workspace=backend"

echo Starting frontend...
start "Frontend" cmd /c "npm run dev --workspace=frontend"

echo Starting YOUPI PG payment gateway...
start "YOUPI PG" cmd /c "npm --prefix payment-gateway run dev"

echo.
echo Services are starting in separate windows:
echo   Backend:      http://localhost:4000
echo   Database:     embedded PGlite (backend\.pgdata, no Docker required)
echo   Frontend:     http://localhost:3000
echo   Payment API:  http://localhost:6100
echo   Checkout:     http://localhost:7000
echo   Merchant:     http://localhost:6001
echo.
echo First run only:
echo   1. copy backend\.env.example backend\.env
echo   2. copy payment-gateway\.env.example payment-gateway\.env
echo   3. set matching YOUPI_ADMIN_TOKEN / ADMIN_API_TOKEN in both files
echo   4. npm run gateway:install
echo   5. npm run gateway:webhook
echo.
pause
