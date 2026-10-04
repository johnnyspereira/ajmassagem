@echo off
setlocal
title JP Massagem - AI Tunnel

set "CLOUDFLARED_CONFIG=%USERPROFILE%\.cloudflared\ollama-ai-worker.yml"

where cloudflared >nul 2>&1
if errorlevel 1 (
  echo Cloudflared nao foi encontrado no PATH.
  pause
  exit /b 1
)

cloudflared --protocol quic --edge-ip-version 4 --metrics 127.0.0.1:20242 --config "%CLOUDFLARED_CONFIG%" tunnel run
