const { spawn, execFile } = require('node:child_process');
const { readFileSync, existsSync, appendFileSync, mkdirSync } = require('node:fs');
const { join, dirname, resolve } = require('node:path');
const os = require('node:os');

function isProjectRoot(candidate) {
  return existsSync(join(candidate, 'workers', 'whatsapp-bridge', 'server.cjs'))
    && existsSync(join(candidate, 'workers', 'ollama-bridge', 'server.cjs'));
}

function findProjectRoot() {
  const candidates = [process.env.JP_MASSAGEM_PROJECT_DIR, process.cwd(), join(__dirname, '..'), dirname(process.execPath)].filter(Boolean);
  for (const initial of candidates) {
    let candidate = resolve(initial);
    for (let depth = 0; depth < 7; depth += 1) {
      if (isProjectRoot(candidate)) return candidate;
      const parent = dirname(candidate);
      if (parent === candidate) break;
      candidate = parent;
    }
  }
  return resolve(__dirname, '..');
}

const PROJECT = findProjectRoot();
const LOG_DIR = join(PROJECT, 'logs', 'control-center');
// In Electron, process.execPath points to electron.exe. Workers must always be
// started by Node itself, otherwise Electron tries to run server.cjs as an app.
const NODE_EXECUTABLE = process.env.JP_MASSAGEM_NODE
  || join(process.env.ProgramFiles || 'C:\\Program Files', 'nodejs', 'node.exe');
const MAX_EVENTS = 700;
const startedAt = Date.now();

function readEnv(file) {
  if (!existsSync(file)) return {};
  return Object.fromEntries(
    readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const index = line.indexOf('=');
        return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^"|"$/g, '')];
      })
  );
}

function run(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { windowsHide: true, maxBuffer: 1024 * 1024, ...options }, (error, stdout, stderr) => {
      if (error) return reject(new Error(stderr?.trim() || error.message));
      resolve(stdout.trim());
    });
  });
}

async function powershell(script) {
  return run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script]);
}

async function processForPort(port) {
  try {
    const output = await powershell(`$listener=Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if($null -ne $listener){$listener.OwningProcess}`);
    return output ? Number(output) : null;
  } catch { return null; }
}

async function tunnelPids(configName) {
  const escaped = configName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const output = await powershell(`Get-CimInstance Win32_Process -Filter \"Name='cloudflared.exe'\" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match '${escaped}' } | Select-Object -ExpandProperty ProcessId`);
  return output ? output.split(/\r?\n/).map(Number).filter(Boolean) : [];
}

async function processUptime(pid) {
  if (!pid) return null;
  try {
    const output = await powershell(`(Get-Process -Id ${pid} -ErrorAction Stop).StartTime.ToUniversalTime().ToString('o')`);
    return output || null;
  } catch { return null; }
}

async function systemMetrics() {
  const base = { totalMemory: os.totalmem(), freeMemory: os.freemem(), appMemory: process.memoryUsage().rss, cpuPercent: null, disk: null, network: null };
  try {
    const output = await powershell("$cpu=(Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average; $disk=Get-CimInstance Win32_LogicalDisk -Filter \"DeviceID='C:'\"; $online=Test-Connection -ComputerName 1.1.1.1 -Count 1 -Quiet -ErrorAction SilentlyContinue; @{cpu=$cpu; size=$disk.Size; free=$disk.FreeSpace; online=$online} | ConvertTo-Json -Compress");
    const parsed = JSON.parse(output);
    return { ...base, cpuPercent: Number.isFinite(Number(parsed.cpu)) ? Number(parsed.cpu) : null, disk: parsed.size ? { size: Number(parsed.size), free: Number(parsed.free) } : null, network: typeof parsed.online === 'boolean' ? parsed.online : null };
  } catch { return base; }
}

function minutesSince(iso) {
  if (!iso) return null;
  return Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 60_000));
}

class Supervisor {
  constructor() {
    this.events = [];
    this.children = new Map();
    this.last = null;
    this.rootEnv = readEnv(join(PROJECT, '.env'));
    this.whatsAppEnv = readEnv(join(PROJECT, 'workers', 'whatsapp-bridge', '.env'));
    this.services = {
      whatsappWorker: {
        id: 'whatsappWorker', label: 'WhatsApp Worker', kind: 'worker', port: 4100,
        cwd: join(PROJECT, 'workers', 'whatsapp-bridge'), command: NODE_EXECUTABLE,
        args: ['--use-system-ca', 'server.cjs'], env: { ...process.env, ...this.whatsAppEnv },
      },
      whatsappTunnel: {
        id: 'whatsappTunnel', label: 'WhatsApp Tunnel', kind: 'tunnel', config: 'config.yml',
        cwd: join(process.env.USERPROFILE || '', '.cloudflared'), command: 'cloudflared',
        args: ['--protocol', 'quic', '--edge-ip-version', '4', '--config', join(process.env.USERPROFILE || '', '.cloudflared', 'config.yml'), 'tunnel', 'run'],
      },
      aiWorker: {
        id: 'aiWorker', label: 'AI Worker', kind: 'worker', port: 3002,
        cwd: join(PROJECT, 'workers', 'ollama-bridge'), command: NODE_EXECUTABLE,
        args: ['--use-system-ca', 'server.cjs'], env: { ...process.env, ...this.rootEnv },
      },
      aiTunnel: {
        id: 'aiTunnel', label: 'AI Tunnel', kind: 'tunnel', config: 'ollama-ai-worker.yml', metricsPort: 20242,
        cwd: join(PROJECT, 'workers', 'ollama-bridge'), command: 'cloudflared',
        args: ['--protocol', 'quic', '--edge-ip-version', '4', '--metrics', '127.0.0.1:20242', '--config', join(process.env.USERPROFILE || '', '.cloudflared', 'ollama-ai-worker.yml'), 'tunnel', 'run'],
      },
    };
  }

  event(service, level, message) {
    const entry = { id: `${Date.now()}-${Math.random()}`, at: new Date().toISOString(), service, level, message };
    this.events.unshift(entry);
    if (this.events.length > MAX_EVENTS) this.events.length = MAX_EVENTS;
    mkdirSync(LOG_DIR, { recursive: true });
    appendFileSync(join(LOG_DIR, 'control-center.log'), `[${entry.at}] [${service}] ${level.toUpperCase()} ${message}\n`);
    return entry;
  }

  persistedEvents() {
    const file = join(LOG_DIR, 'control-center.log');
    if (!existsSync(file)) return [];
    return readFileSync(file, 'utf8').split(/\r?\n/).slice(-500).map((line, index) => {
      const match = line.match(/^\[(.*?)\] \[(.*?)\] (INFO|WARN|ERROR) (.*)$/);
      return match ? { id: `file-${index}-${match[1]}`, at: match[1], service: match[2], level: match[3].toLowerCase(), message: match[4] } : null;
    }).filter(Boolean);
  }

  async probeHttp(url, headers = {}) {
    try {
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(4_000) });
      const body = await response.json().catch(() => ({}));
      return { ok: response.ok, status: response.status, body };
    } catch (error) {
      return { ok: false, status: 0, error: error.message };
    }
  }

  async serviceState(service) {
    let pids = [];
    if (service.port) {
      const pid = await processForPort(service.port);
      if (pid) pids = [pid];
    } else {
      pids = await tunnelPids(service.config);
    }
    const uptimeAt = await processUptime(pids[0]);
    let health = { ok: pids.length > 0, detail: pids.length ? 'Processo ativo.' : 'Processo não encontrado.' };
    if (service.id === 'whatsappWorker' && pids[0]) {
      const accountId = this.whatsAppEnv.ACCOUNT_ID;
      const userId = this.whatsAppEnv.USER_ID;
      const probe = await this.probeHttp(`http://127.0.0.1:4100/status?account_id=${encodeURIComponent(accountId || '')}&user_id=${encodeURIComponent(userId || '')}`, { authorization: `Bearer ${this.whatsAppEnv.WORKER_SECRET || ''}` });
      health = probe.ok ? { ok: Boolean(probe.body.connected), detail: probe.body.connected ? 'Sessão QR conectada.' : `Sessão: ${probe.body.state || 'desconhecida'}.`, meta: probe.body } : { ok: false, detail: probe.error || 'Health check não respondeu.' };
    }
    if (service.id === 'aiWorker' && pids[0]) {
      const probe = await this.probeHttp('http://127.0.0.1:3002/status', { authorization: `Bearer ${this.rootEnv.AI_WORKER_SECRET || ''}` });
      health = probe.ok ? { ok: true, detail: 'API IA respondeu.', meta: probe.body } : { ok: false, detail: probe.error || 'Health check não respondeu.' };
    }
    // Never send command lines or environment variables to the renderer.  Besides
    // not being useful in the UI, those can contain worker credentials.
    return {
      id: service.id,
      label: service.label,
      kind: service.kind,
      port: service.port || null,
      pids,
      duplicate: pids.length > 1,
      managed: this.children.has(service.id),
      startedAt: uptimeAt,
      uptimeMinutes: minutesSince(uptimeAt),
      health,
    };
  }

  async snapshot() {
    const services = await Promise.all(Object.values(this.services).map((service) => this.serviceState(service)));
    const ollama = await this.probeHttp('http://127.0.0.1:11434/api/tags');
    const metrics = await systemMetrics();
    const snapshot = {
      startedAt: new Date(startedAt).toISOString(), uptimeMinutes: Math.floor((Date.now() - startedAt) / 60_000),
      services, events: [...this.events, ...this.persistedEvents()].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 250),
      ollama: { online: ollama.ok, models: ollama.ok ? (ollama.body.models || []).map((model) => model.name) : [], detail: ollama.ok ? 'Ollama local respondeu.' : ollama.error || 'Ollama indisponível.' },
      project: { path: PROJECT, configured: isProjectRoot(PROJECT), envFound: existsSync(join(PROJECT, '.env')) },
      system: { cpuCount: os.cpus().length, ...metrics },
    };
    this.last = snapshot;
    return snapshot;
  }

  async start(id) {
    const service = this.services[id];
    if (!service) throw new Error('Serviço desconhecido.');
    const current = await this.serviceState(service);
    if (current.pids.length) return { changed: false, reason: 'Já está ativo.' };
    const child = spawn(service.command, service.args, { cwd: service.cwd, env: service.env || process.env, windowsHide: true, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    child.unref();
    this.children.set(id, child);
    this.event(service.label, 'info', `Iniciado pelo Control Center (PID ${child.pid}).`);
    for (const [stream, level] of [[child.stdout, 'info'], [child.stderr, 'error']]) {
      stream?.on('data', (chunk) => String(chunk).split(/\r?\n/).filter(Boolean).forEach((line) => {
        const actualLevel = service.kind === 'tunnel' && /\bINF\b/.test(line) ? 'info' : level;
        this.event(service.label, actualLevel, line);
      }));
    }
    child.once('exit', (code) => { this.children.delete(id); this.event(service.label, code === 0 ? 'info' : 'error', `Processo terminou com código ${code ?? 'desconhecido'}.`); });
    return { changed: true };
  }

  async stop(id) {
    const service = this.services[id];
    if (!service) throw new Error('Serviço desconhecido.');
    const current = await this.serviceState(service);
    for (const pid of current.pids) {
      try {
        await run('taskkill.exe', ['/PID', String(pid), '/T', '/F']);
      } catch (error) {
        // taskkill /T can fail on an already-ended child while the parent is
        // still completing shutdown. Wait for the actual parent, then retry
        // that PID alone instead of retrying a stale process tree.
        const check = `$targetProcess=Get-Process -Id ${pid} -ErrorAction SilentlyContinue; if($targetProcess -and -not $targetProcess.WaitForExit(1500)){'alive'}`;
        if (await powershell(check)) {
          try { await run('taskkill.exe', ['/PID', String(pid), '/F']); }
          catch { /* Verify the final state, including another exit race. */ }
          if (await powershell(check)) throw new Error(`Não foi possível parar ${service.label}. O processo ${pid} continua ativo; verifique as permissões do Windows.`);
        }
      }
    }
    this.children.delete(id);
    this.event(service.label, 'warn', current.pids.length ? 'Parado pelo Control Center.' : 'Já estava parado.');
    return { changed: current.pids.length > 0 };
  }

  async restart(id) {
    // Let WhatsApp close its own Chrome profile before restarting the session.
    // A forced process-tree kill can leave the profile locked on Windows.
    if (id === 'whatsappWorker') {
      try {
        const response = await fetch('http://127.0.0.1:4100/restart', {
          method: 'POST',
          headers: { authorization: `Bearer ${this.whatsAppEnv.WORKER_SECRET || ''}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ accountId: this.whatsAppEnv.ACCOUNT_ID, userId: this.whatsAppEnv.USER_ID }),
          signal: AbortSignal.timeout(60_000),
        });
        if (response.ok) { this.event('WhatsApp Worker', 'info', 'Sessão reiniciada com autenticação preservada.'); return { changed: true }; }
      } catch { /* The process may be offline; fall back to a process restart. */ }
    }
    await this.stop(id); await new Promise((resolve) => setTimeout(resolve, 800)); return this.start(id);
  }
  async stopAll() {
    for (const id of ['whatsappTunnel', 'aiTunnel', 'whatsappWorker', 'aiWorker']) await this.stop(id);
    return this.snapshot();
  }
  async restartAll() { for (const id of ['whatsappTunnel', 'aiTunnel', 'whatsappWorker', 'aiWorker']) await this.stop(id); for (const id of ['aiWorker', 'aiTunnel', 'whatsappWorker', 'whatsappTunnel']) await this.start(id); return this.snapshot(); }
  clearView() { this.events = []; }
}

module.exports = { Supervisor, PROJECT, LOG_DIR };
