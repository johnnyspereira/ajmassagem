param([Parameter(Mandatory=$true)][string]$ZipPath,[Parameter(Mandatory=$true)][string]$InstallRoot)
$ErrorActionPreference='Stop'
$log=Join-Path $env:TEMP 'jp-designer-crm-update.log'
Start-Transcript -Path $log -Append | Out-Null
trap { Add-Content -LiteralPath $log -Value "ERRO: $($_.Exception.Message)"; Stop-Transcript | Out-Null; exit 1 }
$stage=Join-Path $env:TEMP 'jp-designer-crm-update-stage'
if(Test-Path $stage){Remove-Item $stage -Recurse -Force}
Expand-Archive -LiteralPath $ZipPath -DestinationPath $stage -Force
$source=Get-ChildItem $stage -Directory | Select-Object -First 1
if(-not $source){throw 'Pacote GitHub vazio.'}
Start-Sleep -Seconds 6
$ok=$false
for($i=1;$i -le 5;$i++){
  robocopy $source.FullName $InstallRoot /E /COPY:DAT /R:3 /W:2 /XD node_modules logs Cache 'Code Cache' GPUCache whatsapp_auth .cloudflared /XF .env *.log *.tmp | Out-Null
  if($LASTEXITCODE -lt 8){$ok=$true;break}
  Start-Sleep -Seconds 3
}
if(-not $ok){throw "Falha ao aplicar atualização após 5 tentativas (robocopy $LASTEXITCODE)."}
$launcher=Join-Path $InstallRoot 'control-center\start-control-center.cmd'
if(-not (Test-Path $launcher)){throw "Launcher não encontrado: $launcher"}
Start-Process -FilePath 'cmd.exe' -ArgumentList @('/c',"`"$launcher`"") -WorkingDirectory (Split-Path $launcher) -WindowStyle Hidden
Add-Content -LiteralPath $log -Value "Control Center relançado: $launcher"
Stop-Transcript | Out-Null
