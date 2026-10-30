const { win32 } = require('node:path');

function listeningPorts(output) {
  const ports = new Map();
  for (const line of output.split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/);
    if (parts[0] !== 'TCP' || parts[3] !== 'LISTENING') continue;
    const port = Number(parts[1].slice(parts[1].lastIndexOf(':') + 1));
    const pid = Number(parts[4]);
    if (port > 0 && pid > 0) ports.set(port, pid);
  }
  return ports;
}

function configMatches(commandLine, expected) {
  const match = /(?:^|\s)--config(?:\s+|=)(?:"([^"]+)"|([^\s]+))/i.exec(commandLine || '');
  return !!match && win32.normalize(match[1] || match[2]).toLowerCase() === win32.normalize(expected).toLowerCase();
}

/** One bounded discovery shared by all cards; expensive CIM metadata is cached. */
class ProcessInventory {
  constructor(run, now = Date.now) {
    this.run = run;
    this.now = now;
    this.value = null;
    this.pending = null;
    this.updatedAt = 0;
    this.metadataAt = 0;
    this.processes = [];
    this.metadataError = null;
  }

  read(force = false) {
    if (this.pending) return force ? this.pending.then(() => this.read(true)) : this.pending;
    if (!force && this.value && this.now() - this.updatedAt < 10_000) return Promise.resolve(this.value);
    this.pending = this.collect(force).finally(() => { this.pending = null; });
    return this.pending;
  }

  async collect(force) {
    const portsPromise = this.run('netstat.exe', ['-ano', '-p', 'tcp'])
      .then(output => ({ ports: listeningPorts(output) }), error => ({ error }));
    if (force || !this.metadataAt || this.now() - this.metadataAt >= 30_000) {
      const script = "$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; @(Get-CimInstance Win32_Process -Filter \"Name='cloudflared.exe' OR Name='node.exe'\" | Select-Object ProcessId,Name,CommandLine,WorkingSetSize,@{Name='StartedAt';Expression={$_.CreationDate.ToUniversalTime().ToString('o')}}) | ConvertTo-Json -Compress";
      try {
        const raw = await this.run('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')]);
        const rows = JSON.parse(raw.replace(/^\uFEFF/, '') || '[]');
        this.processes = Array.isArray(rows) ? rows : [rows];
        this.metadataError = null;
      } catch (error) {
        this.metadataError = error;
      }
      // Back off even when WMI is unavailable instead of flooding Windows.
      this.metadataAt = this.now();
    }
    const result = await portsPromise;
    if (result.error) throw result.error;
    const { ports } = result;
    if (force && this.metadataError) throw new Error('Não foi possível verificar os processos. Aguarde alguns segundos e tente novamente.');
    this.value = { ports, processes: this.processes, metadataAvailable: !this.metadataError };
    this.updatedAt = this.now();
    return this.value;
  }
}

module.exports = { ProcessInventory, listeningPorts, configMatches };
