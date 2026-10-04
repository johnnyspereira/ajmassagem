$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
$whatsAppDirectory = Join-Path $projectDirectory 'workers\whatsapp-bridge'
$whatsAppStarter = Join-Path $whatsAppDirectory 'start-worker.cmd'
$aiStarter = Join-Path $PSScriptRoot 'start-ai-worker.ps1'

function Stop-ProcessTree([int]$ProcessId) {
  if ($ProcessId -gt 0) {
    & taskkill.exe /PID $ProcessId /T /F 2>$null | Out-Null
  }
}

function Stop-PortListener([int]$Port) {
  Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique |
    ForEach-Object { Stop-ProcessTree $_ }
}

function Stop-WorkerTerminals {
  # Only close consoles belonging to the CRM workers. This clears old worker
  # windows without interrupting an unrelated terminal the user may be using.
  Get-Process -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowTitle -like 'JP Massagem -*' } |
    ForEach-Object { Stop-ProcessTree $_.Id }
}

# Close every old worker console and process tree before starting a clean set.
Stop-WorkerTerminals

# Stop the workers by their fixed local ports. This also handles a worker that
# was started without its normal console window.
Stop-PortListener 4100
Stop-PortListener 3002

# Close only cloudflared instances launched for the CRM worker tunnels.
Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" -ErrorAction SilentlyContinue |
  Where-Object {
    $_.CommandLine -match 'ollama-ai-worker|\\.cloudflared\\config\.yml|cloudflared.*tunnel run'
  } |
  ForEach-Object { Stop-ProcessTree $_.ProcessId }

Start-Sleep -Milliseconds 900

if (-not (Test-Path -LiteralPath $whatsAppStarter)) {
  throw 'O iniciador do worker WhatsApp nÃ£o foi encontrado.'
}
Start-Process -FilePath $whatsAppStarter -WorkingDirectory $whatsAppDirectory

if (Test-Path -LiteralPath $aiStarter) {
  # cmd /k keeps a visible diagnostic window alive if the AI worker cannot
  # start, instead of silently closing the PowerShell window.
  $aiCommand = "powershell.exe -NoExit -ExecutionPolicy Bypass -File `"$aiStarter`""
  Start-Process -FilePath 'cmd.exe' -ArgumentList @('/k', $aiCommand) `
    -WorkingDirectory $projectDirectory
}

$aiTunnel = Join-Path $projectDirectory 'workers\ollama-bridge\start-ai-tunnel.cmd'
$aiConfig = Join-Path $env:USERPROFILE '.cloudflared\ollama-ai-worker.yml'
if ((Test-Path -LiteralPath $aiTunnel) -and (Test-Path -LiteralPath $aiConfig)) {
  Start-Process -FilePath $aiTunnel -WorkingDirectory (Split-Path -Parent $aiTunnel)
}

for ($attempt = 0; $attempt -lt 10; $attempt++) {
  $whatsAppOnline = [bool](Get-NetTCPConnection -LocalPort 4100 -State Listen -ErrorAction SilentlyContinue)
  $aiOnline = [bool](Get-NetTCPConnection -LocalPort 3002 -State Listen -ErrorAction SilentlyContinue)
  if ($whatsAppOnline -and $aiOnline) { break }
  Start-Sleep -Seconds 2
}
$whatsAppState = if ($whatsAppOnline) { 'ativo' } else { 'a iniciar' }
$aiState = if ($aiOnline) { 'ativo' } else { 'a iniciar' }

Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.MessageBox]::Show(
  "Workers reiniciados.`n`nWhatsApp (porta 4100): $whatsAppState`nIA (porta 3002): $aiState",
  'JP Massagem - Workers',
  [System.Windows.Forms.MessageBoxButtons]::OK,
  [System.Windows.Forms.MessageBoxIcon]::Information
) | Out-Null
