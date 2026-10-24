@echo off
cd /d "%~dp0"

echo Starting backend (Appwrite primary database)...
start "Backend" cmd /c "npm run dev --workspace=backend"

echo Starting frontend...
start "Frontend" cmd /c "npm run dev --workspace=frontend"

echo Starting YOUPI PG payment gateway...
start "YOUPI PG" cmd /c "npm --prefix payment-gateway run dev"

echo.
echo Services are starting in separate windows:
echo   Backend:      http://localhost:4000
echo   Database:     Appwrite (project 6adaf4be003ae5c9e622)
echo   Frontend:     http://localhost:3000
echo   Payment API:  http://localhost:6100
echo   Checkout:     http://localhost:7000
echo   Merchant:     http://localhost:6001
echo.
echo First run only:
echo   1. copy backend\.env.example backend\.env
echo   2. set APPWRITE_API_KEY in backend\.env
echo   3. npm run appwrite:setup --workspace=backend
echo   4. copy payment-gateway\.env.example payment-gateway\.env
echo   5. set matching YOUPI_ADMIN_TOKEN / ADMIN_API_TOKEN in both files
echo   6. npm run gateway:install
echo   7. npm run gateway:webhook
echo.
pause
