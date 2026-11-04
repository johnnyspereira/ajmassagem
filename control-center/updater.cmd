@echo off
setlocal
set "ROOT=%~dp1"
if "%ROOT%"=="" set "ROOT=%~dp0..\"
set "ZIP=%~2"
if "%ZIP%"=="" set "ZIP=%USERPROFILE%\Downloads\jp-designer-crm-main.zip"
start "JP Designer CRM Updater" powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\scripts\apply-control-center-update.ps1" -ZipPath "%ZIP%" -InstallRoot "%ROOT%"
exit /b 0
