$ErrorActionPreference = 'Stop'
$crmRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$nodeExecutable = Join-Path $env:ProgramFiles 'nodejs\node.exe'
$runnerPath = Join-Path $PSScriptRoot 'appointment-reminders.cjs'
$hiddenRunner = Join-Path $PSScriptRoot 'appointment-reminders-hidden.vbs'
$scriptHost = Join-Path $env:WINDIR 'System32\wscript.exe'
if (!(Test-Path -LiteralPath $nodeExecutable) -or !(Test-Path -LiteralPath $runnerPath)) { throw 'Node ou rotina de lembretes não encontrados.' }
if (!(Test-Path -LiteralPath $hiddenRunner) -or !(Test-Path -LiteralPath $scriptHost)) { throw 'Executor invisível dos lembretes não encontrado.' }
$taskAction = New-ScheduledTaskAction -Execute $scriptHost -Argument ('//B //NoLogo "' + $hiddenRunner + '"') -WorkingDirectory $crmRoot
$taskTrigger = New-ScheduledTaskTrigger -Once -At ((Get-Date).AddMinutes(1)) -RepetitionInterval (New-TimeSpan -Minutes 5)
$taskSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 4) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$taskPrincipal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName 'JP Massagem - Lembretes da agenda' -Action $taskAction -Trigger $taskTrigger -Settings $taskSettings -Principal $taskPrincipal -Description 'Executa lembretes da sessão e pedidos de confirmação pendentes a cada cinco minutos. Requer computador ligado, sessão Windows iniciada e rede.' -Force | Select-Object TaskName,State
