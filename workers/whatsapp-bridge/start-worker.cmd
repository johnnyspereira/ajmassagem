@echo off
setlocal
set "WORKER_DIRECTORY=%~dp0"

rem This launcher intentionally opens visible windows. Do not change it to
rem hidden execution: endpoint protection may flag hidden Node/tunnel workers.
netstat -ano | findstr /R /C:":4100 .*LISTENING" >nul
if errorlevel 1 (
  start "JP Massagem - WhatsApp Worker" /D "%WORKER_DIRECTORY%" cmd /k "node --use-system-ca server.cjs"
)

set "CLOUDFLARED_CONFIG=%USERPROFILE%\.cloudflared\config.yml"
tasklist /FI "IMAGENAME eq cloudflared.exe" /NH | findstr /I "cloudflared.exe" >nul
if errorlevel 1 (
  start "JP Massagem - WhatsApp Tunnel" cmd /k "cloudflared --config \"%CLOUDFLARED_CONFIG%\" tunnel run"
)

echo O worker e o tunnel foram iniciados em janelas visiveis.
echo Mantenha-as abertas enquanto usar WhatsApp por QR.
endlocal
