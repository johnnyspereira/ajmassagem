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
$sourceCloudflared = Join-Path $localRoot '.cloudflared'
if (Test-Path $sourceCloudflared) {
  $userCloudflared = Join-Path $env:USERPROFILE '.cloudflared'
  New-Item -ItemType Directory -Force -Path $userCloudflared | Out-Null
  Copy-Item "$sourceCloudflared\*" $userCloudflared -Recurse -Force
  Get-ChildItem $userCloudflared -Filter '*.yml' -File | ForEach-Object {
    $text = Get-Content $_.FullName -Raw
    $text = [regex]::Replace($text, "C:/Users/[^/]+/\.cloudflared", ($userCloudflared -replace '\\','/'))
    Set-Content -LiteralPath $_.FullName -Value $text -Encoding utf8
  }
}
$cloudflared = Join-Path $localRoot 'tools\cloudflared.exe'
if (-not (Test-Path $cloudflared)) { throw "cloudflared.exe não foi incluído no pacote: $cloudflared" }
$toolsPath = Split-Path -Parent $cloudflared
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if (-not (($userPath -split ';') -contains $toolsPath)) {
  [Environment]::SetEnvironmentVariable('Path', (($userPath.TrimEnd(';') + ';' + $toolsPath).Trim(';')), 'User')
}
$env:Path = "$toolsPath;$env:Path"
# Evita reutilizar caches incompletas após uma instalação interrompida.
# Uma pasta nova por tentativa também não interfere com processos antigos.
$env:PUPPETEER_CACHE_DIR = Join-Path $env:USERPROFILE '.cache\puppeteer'
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
Push-Location (Join-Path $localRoot 'workers\whatsapp-bridge')
try {
  Write-Host 'A instalar o Chrome usado pelo Puppeteer...'
  & npx.cmd --yes puppeteer browsers install chrome@stable
  if ($LASTEXITCODE -ne 0) { throw "Não foi possível instalar o Chrome do Puppeteer (código $LASTEXITCODE)." }
} finally { Pop-Location }
@"
@echo off
set "JP_MASSAGEM_PROJECT_DIR=$localRoot"
cd /d "%JP_MASSAGEM_PROJECT_DIR%"
start "JP Massagem Control Center" npm run control:center
"@ | Set-Content -Encoding ascii (Join-Path $localRoot 'control-center\start-control-center.cmd')
$desktop = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktop 'JP Designer CRM Control Center.lnk'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = Join-Path $localRoot 'control-center\start-control-center.cmd'
$shortcut.WorkingDirectory = $localRoot
$shortcut.Description = 'Abrir o JP Designer CRM Control Center'
$shortcut.Save()
Write-Host "Atalho criado no Ambiente de Trabalho: $shortcutPath"
Write-Host ''
Write-Host 'Instalação concluída com sucesso.' -ForegroundColor Green
Write-Host "Abra: $localRoot\control-center\start-control-center.cmd"
