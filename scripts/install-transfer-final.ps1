$ErrorActionPreference = 'Stop'
$sourceRoot = Split-Path -Parent $PSScriptRoot
$localRoot = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'JP-Massagem-Workers'
New-Item -ItemType Directory -Force -Path $localRoot | Out-Null
Write-Host "A copiar a instalação para $localRoot ..."
$copy = Start-Process -FilePath robocopy.exe -ArgumentList @(
  "`"$sourceRoot`"", "`"$localRoot`"", '/E', '/COPY:DAT', '/DCOPY:DAT', '/R:2', '/W:2',
  '/XD', 'node_modules', 'logs', 'Cache', 'Code Cache', 'GPUCache',
  '/XF', '*.log', '*.tmp', '/NFL', '/NDL', '/NJH', '/NJS', '/NP'
) -Wait -PassThru -NoNewWindow
if ($copy.ExitCode -ge 8) { throw "Falha ao copiar a instalação (robocopy $($copy.ExitCode))." }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Instale Node.js 20 ou superior antes de continuar.' }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw 'O npm não está disponível.' }
if (-not (Test-Path (Join-Path $localRoot 'package.json'))) { throw "Cópia incompleta: $localRoot\package.json não foi encontrado." }
# Evita caches globais incompletas (comuns após uma instalação interrompida).
$env:PUPPETEER_CACHE_DIR = Join-Path $localRoot '.puppeteer-cache'
if (-not (Test-Path $env:PUPPETEER_CACHE_DIR)) { New-Item -ItemType Directory -Force -Path $env:PUPPETEER_CACHE_DIR | Out-Null }
function Install-Dependencies([string]$path) {
  Push-Location $path
  try {
    # npm e scripts do projeto devem correr sempre no disco local, nunca na partilha.
    $env:INIT_CWD = $path
    & npm.cmd install --prefer-offline
    if ($LASTEXITCODE -ne 0) { throw "npm install falhou em $path (código $LASTEXITCODE)." }
  }
  finally { Pop-Location }
}
Write-Host 'A instalar dependências do Control Center...'
Install-Dependencies $localRoot
Write-Host 'A instalar dependências do Worker WhatsApp...'
Install-Dependencies (Join-Path $localRoot 'workers\whatsapp-bridge')
@"
@echo off
set "JP_MASSAGEM_PROJECT_DIR=$localRoot"
cd /d "%JP_MASSAGEM_PROJECT_DIR%"
start "JP Massagem Control Center" npm run control:center
"@ | Set-Content -Encoding ascii (Join-Path $localRoot 'control-center\start-control-center.cmd')
Write-Host ''
Write-Host 'Instalação concluída com sucesso.' -ForegroundColor Green
Write-Host "Abra: $localRoot\control-center\start-control-center.cmd"
