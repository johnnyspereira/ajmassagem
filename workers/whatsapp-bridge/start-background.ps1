$ErrorActionPreference = 'Stop'

# Deliberately transparent launcher. Avast correctly treats hidden process
# creation as suspicious; the WhatsApp bridge must be started visibly so its
# owner can verify Node and Cloudflare are actually running.
$workerDirectory = Split-Path -Parent $PSCommandPath
$launcher = Join-Path $workerDirectory 'start-worker.cmd'

if (-not (Test-Path -LiteralPath $launcher)) {
  throw 'O inicializador do WhatsApp não foi encontrado.'
}

& $launcher
