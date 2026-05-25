@echo off
echo ============================================
echo   fut.invest - One-Click Deploy to Render
echo ============================================
echo.
echo This script will:
echo   1. Initialize git repo (if not exists)
echo   2. Add all files
echo   3. Commit changes
echo   4. Guide you to push to GitHub
echo.
pause

echo.
echo [1/4] Initializing git...
cd /d "%~dp0"
if not exist .git (
    git init
    echo Git repo initialized
) else (
    echo Git repo already exists
)

echo.
echo [2/4] Adding files...
git add -A
echo Files added

echo.
echo [3/4] Committing...
git commit -m "Deploy to Render - fut.invest v2.0.0" 2>nul
if %errorlevel% equ 0 (
    echo Committed successfully
) else (
    echo No changes to commit or already committed
)

echo.
echo [4/4] Next steps:
echo.
echo 1. Create a GitHub repo at: https://github.com/new
echo 2. Run these commands:
echo.
echo    git remote add origin https://github.com/TU-USUARIO/fut-invest.git
echo    git branch -M main
echo    git push -u origin main
echo.
echo 3. Go to https://render.com and sign up
echo 4. Click "New +" -^> "Blueprint"
echo 5. Connect your GitHub repo
echo 6. Render will auto-deploy!
echo.
echo Your app will be live at:
echo   Frontend: https://futinvest-frontend.onrender.com
echo   Backend:  https://futinvest-backend.onrender.com
echo.
pause
