@echo off
echo Starting fut.invest development servers...

REM Start backend
cd backend
set NODE_ENV=development
set JWT_SECRET=dev-secret-do-not-use-in-production
set TOTP_SECRET=dev-totp-secret-do-not-use-in-production
set APP_SECRET=dev-app-secret-do-not-use-in-production
set DB_PATH=./data/fut_invest.db
set REQUIRE_EMAIL_VERIFICATION=false
set FRONTEND_URL=http://localhost:8000
start "Backend" cmd /k "node backend-start.js"
cd ..

REM Wait for backend to start
timeout /t 5 /nobreak >nul

REM Start frontend
start "Frontend" cmd /k "node serve.js"

echo.
echo ========================================
echo  fut.invest Development Servers
echo ========================================
echo  Frontend: http://localhost:8000
echo  Backend:  http://localhost:3001
echo.
echo  Demo Login:
echo  Email: demo@futinvest.io
echo  Password: Demo123!
echo ========================================
echo.
