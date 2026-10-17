@echo off
setlocal
title PaperOnBoard deployment
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File "%~dp0scripts\deploy-local.ps1" %*
set "deploy_result=%ERRORLEVEL%"
echo.
if not "%deploy_result%"=="0" echo Deployment stopped. Read the error and log path above.
pause
exit /b %deploy_result%
