@echo off
echo ============================================
echo   fut.invest - Deploy to DigitalOcean
echo ============================================
echo.
echo This script will guide you through deploying to DigitalOcean App Platform.
echo.
echo Prerequisites:
echo   1. DigitalOcean account (https://cloud.digitalocean.com)
echo   2. GitHub repo with your code
echo   3. DigitalOcean CLI installed (optional)
echo.
echo Steps:
echo.
echo 1. Go to: https://cloud.digitalocean.com/apps
echo 2. Click "Create App"
echo 3. Connect your GitHub account
echo 4. Select your fut-invest repository
echo 5. DigitalOcean will auto-detect .do/app.yaml
echo 6. Click "Next" and configure environment variables
echo 7. Click "Create Resources"
echo.
echo Your app will be live at:
echo   https://futinvest-xxxxx.ondigitalocean.app
echo.
echo ============================================
echo Environment Variables to Configure:
echo ============================================
echo.
echo JWT_SECRET=^(generate with: node -e "console.log(require('crypto').randomBytes(48).toString('base64')"^)
echo TOTP_SECRET=^(generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64')"^)
echo APP_SECRET=^(generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex')"^)
echo FRONTEND_URL=https://futinvest-xxxxx.ondigitalocean.app
echo.
pause
