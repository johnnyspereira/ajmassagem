param([Parameter(Mandatory=$true)][string]$ZipPath,[Parameter(Mandatory=$true)][string]$InstallRoot)
$ErrorActionPreference='Stop'
$stage=Join-Path $env:TEMP 'jp-designer-crm-update-stage'
if(Test-Path $stage){Remove-Item $stage -Recurse -Force}
Expand-Archive -LiteralPath $ZipPath -DestinationPath $stage -Force
$source=Get-ChildItem $stage -Directory | Select-Object -First 1
if(-not $source){throw 'Pacote GitHub vazio.'}
Start-Sleep -Seconds 2
robocopy $source.FullName $InstallRoot /E /COPY:DAT /R:3 /W:2 /XD node_modules logs Cache 'Code Cache' GPUCache whatsapp_auth .cloudflared /XF .env *.log *.tmp | Out-Null
if($LASTEXITCODE -ge 8){throw "Falha ao aplicar atualização (robocopy $LASTEXITCODE)."}
$launcher=Join-Path $InstallRoot 'control-center\start-control-center.cmd'
if(Test-Path $launcher){Start-Process -FilePath $launcher -WorkingDirectory (Split-Path $launcher)}
