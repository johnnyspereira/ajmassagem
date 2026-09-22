@echo off
setlocal

set "CLOUDFLARED_EXE=%ProgramFiles(x86)%\cloudflared\cloudflared.exe"
set "CLOUDFLARED_CONFIG=%USERPROFILE%\.cloudflared\ollama-ai-worker.yml"

if not exist "%CLOUDFLARED_EXE%" (
  echo Cloudflared nao foi encontrado em: %CLOUDFLARED_EXE%
  pause
  exit /b 1
)

"%CLOUDFLARED_EXE%" --protocol http2 --metrics 127.0.0.1:20242 --config "%CLOUDFLARED_CONFIG%" tunnel run
