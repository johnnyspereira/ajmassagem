$ErrorActionPreference = 'Stop'

$workerDirectory = Split-Path -Parent $PSCommandPath
$cloudflaredConfig = Join-Path $env:USERPROFILE '.cloudflared\config.yml'

if (-not (Get-NetTCPConnection -LocalPort 4100 -State Listen -ErrorAction SilentlyContinue)) {
  $node = (Get-Command node.exe -ErrorAction Stop).Source
  # cPanel's certificate chain is trusted by Windows but not always by
  # Node's bundled CA store. Use the system store so CRM callbacks (outbox,
  # message persistence and heartbeat) remain available.
  Start-Process -FilePath $node -ArgumentList @('--use-system-ca', 'server.cjs') -WorkingDirectory $workerDirectory -WindowStyle Hidden
}

if (-not (Get-Process -Name cloudflared -ErrorAction SilentlyContinue)) {
  $cloudflared = (Get-Command cloudflared.exe -ErrorAction Stop).Source
  Start-Process -FilePath $cloudflared -ArgumentList "--config `"$cloudflaredConfig`" tunnel run" -WindowStyle Hidden
}
