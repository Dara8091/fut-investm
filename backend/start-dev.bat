@echo off
set NODE_ENV=development
set JWT_SECRET=dev-secret
set APP_SECRET=dev-app-secret
set TOTP_SECRET=dev-totp-secret
node backend-start.js
