$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
$workerDirectory = Join-Path $projectDirectory 'workers\ollama-bridge'
$environmentFile = Join-Path $projectDirectory '.env'

if (-not (Test-Path -LiteralPath $environmentFile)) {
  throw 'Ficheiro .env nÃ£o encontrado para iniciar o worker de IA.'
}

Get-Content -LiteralPath $environmentFile | ForEach-Object {
  $line = $_.Trim()
  if (-not $line -or $line.StartsWith('#') -or $line.IndexOf('=') -lt 1) { return }
  $name, $value = $line.Split('=', 2)
  [Environment]::SetEnvironmentVariable($name.Trim(), $value.Trim().Trim('"'), 'Process')
}

if (-not $env:AI_WORKER_SECRET) {
  throw 'AI_WORKER_SECRET nÃ£o estÃ¡ configurado no .env.'
}

$Host.UI.RawUI.WindowTitle = 'JP Massagem - AI Worker'
Set-Location -LiteralPath $workerDirectory
& node --use-system-ca server.cjs
