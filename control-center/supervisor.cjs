const { spawn, execFile } = require('node:child_process');
const { readFileSync, existsSync, appendFileSync, mkdirSync } = require('node:fs');
const { join, dirname, resolve } = require('node:path');
const os = require('node:os');
const { Buffer } = require('node:buffer');
const { openSync, readSync, closeSync, fstatSync, statfsSync } = require('node:fs');
const { ProcessInventory, configMatches } = require('./process-inventory.cjs');
const { sessionAdvice, safeSession, createRedactor } = require('./diagnostics.cjs');

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
    execFile(file, args, { windowsHide: true, timeout: 8_000, maxBuffer: 1024 * 1024, ...options }, (error, stdout, stderr) => {
      if (error) return reject(new Error(stderr?.trim() || error.message));
      resolve(stdout.trim());
    });
  });
}

async function powershell(script) {
  return run('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')]);
}

let previousCpu = os.cpus().map(cpu => cpu.times);
function systemMetrics() {
  const current = os.cpus().map(cpu => cpu.times);
  let idle = 0, total = 0;
  current.forEach((times, index) => {
    const old = previousCpu[index];
    if (!old) return;
    for (const key of Object.keys(times)) total += times[key] - old[key];
    idle += times.idle - old.idle;
  });
  previousCpu = current;
  let disk = null;
  try { const stats = statfsSync('C:/'); disk = { size: stats.blocks * stats.bsize, free: stats.bavail * stats.bsize }; } catch {}
  return { totalMemory: os.totalmem(), freeMemory: os.freemem(), appMemory: process.memoryUsage().rss,
    cpuPercent: total > 0 ? Math.round((1 - idle / total) * 100) : null, disk, network: null };
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
    this.snapshotPending = null;
    this.snapshotAt = 0;
    this.inventory = new ProcessInventory(run);
    this.rootEnv = readEnv(join(PROJECT, '.env'));
    this.whatsAppEnv = readEnv(join(PROJECT, 'workers', 'whatsapp-bridge', '.env'));
    this.redact = createRedactor(this.rootEnv, this.whatsAppEnv);
    this.diagnosticPending = null;
    this.diagnosticResult = null;
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
    message = this.redact(message);
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
    const fd = openSync(file, 'r');
    let text;
    try {
      const size = fstatSync(fd).size;
      const length = Math.min(size, 64 * 1024);
      const buffer = Buffer.alloc(length);
      readSync(fd, buffer, 0, length, size - length);
      text = buffer.toString('utf8');
      if (size > length) text = text.slice(text.indexOf('\n') + 1);
    } finally { closeSync(fd); }
    return text.split(/\r?\n/).slice(-500).map((line, index) => {
      const match = line.match(/^\[(.*?)\] \[(.*?)\] (INFO|WARN|ERROR) (.*)$/);
      return match ? { id: `file-${index}-${match[1]}`, at: match[1], service: match[2], level: match[3].toLowerCase(), message: this.redact(match[4]) } : null;
    }).filter(Boolean);
  }

  async probeHttp(url, headers = {}) {
    try {
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(4_000) });
      const body = await response.json().catch(() => ({}));
      return { ok: response.ok, status: response.status, body: body && typeof body === 'object' ? body : {} };
    } catch (error) {
      return { ok: false, status: 0, error: error.message };
    }
  }

  async serviceState(service, force = false) {
    let inventory;
    try { inventory = await this.inventory.read(force); }
    catch (error) {
      if (force) throw error;
      return { id:service.id,label:service.label,kind:service.kind,port:service.port||null,pids:[],duplicate:false,managed:this.children.has(service.id),startedAt:null,uptimeMinutes:null,memoryBytes:null,
        health:{ok:false,unavailable:true,detail:'Não foi possível consultar os processos do Windows. Atualize o estado ou execute o diagnóstico.'} };
    }
    const pids = service.port
      ? [inventory.ports.get(service.port)].filter(Boolean)
      : inventory.processes.filter(row => row.Name === 'cloudflared.exe' && configMatches(row.CommandLine, service.args[service.args.indexOf('--config') + 1])).map(row => Number(row.ProcessId));
    const uptimeAt = inventory.processes.find(row => Number(row.ProcessId) === pids[0])?.StartedAt || null;
    let health = { ok: pids.length > 0, detail: pids.length ? 'Processo ativo.' : 'Processo não encontrado.' };
    if (!service.port && !inventory.metadataAvailable) health = { ok: false, detail: 'Verificação temporariamente indisponível; aguarde a próxima atualização.' };
    if (service.id === 'whatsappWorker' && pids[0]) {
      const accountId = this.whatsAppEnv.ACCOUNT_ID;
      const userId = this.whatsAppEnv.USER_ID;
      const probe = await this.probeHttp(`http://127.0.0.1:4100/status?account_id=${encodeURIComponent(accountId || '')}&user_id=${encodeURIComponent(userId || '')}&autostart=false`, { authorization: `Bearer ${this.whatsAppEnv.WORKER_SECRET || ''}` });
      health = probe.ok ? { ok: Boolean(probe.body.connected), detail: this.redact(sessionAdvice(probe.body).detail), title: sessionAdvice(probe.body).title, meta: safeSession({ ...probe.body, lastError: this.redact(probe.body.lastError) }) } : { ok: false, detail: probe.error || 'Health check não respondeu.' };
    }
    if (service.id === 'aiWorker' && pids[0]) {
      const probe = await this.probeHttp('http://127.0.0.1:3002/status', { authorization: `Bearer ${this.rootEnv.AI_WORKER_SECRET || ''}` });
      health = probe.ok ? { ok: true, detail: 'API IA respondeu.', meta: probe.body } : { ok: false, detail: probe.error || 'Health check não respondeu.' };
    }
    if (service.id === 'aiTunnel' && pids[0]) {
      const probe = await this.probeHttp('http://127.0.0.1:20242/ready');
      health = { ok: probe.ok, detail: probe.ok ? 'Túnel ligado à rede Cloudflare.' : 'O processo existe, mas o túnel ainda não confirmou a ligação.' };
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
      memoryBytes: Number(inventory.processes.find(row => Number(row.ProcessId) === pids[0])?.WorkingSetSize) || null,
      health,
    };
  }

  snapshot() {
    if (this.snapshotPending) return this.snapshotPending;
    if (this.last && Date.now() - this.snapshotAt < 10_000) return Promise.resolve(this.last);
    this.snapshotPending = this.collectSnapshot().finally(() => { this.snapshotPending = null; });
    return this.snapshotPending;
  }

  async collectSnapshot() {
    const services = await Promise.all(Object.values(this.services).map((service) => this.serviceState(service)));
    const ollama = await this.probeHttp('http://127.0.0.1:11434/api/tags');
    const metrics = await systemMetrics();
    const snapshot = {
      startedAt: new Date(startedAt).toISOString(), uptimeMinutes: Math.floor((Date.now() - startedAt) / 60_000),
      services, events: [...this.events, ...this.persistedEvents()].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 250),
      ollama: { online: ollama.ok, models: ollama.ok ? (ollama.body.models || []).map((model) => model.name) : [], detail: ollama.ok ? 'Ollama local respondeu.' : ollama.error || 'Ollama indisponível.' },
      checkedAt: new Date().toISOString(),
      diagnostics: this.diagnosticResult,
      project: { path: PROJECT, configured: isProjectRoot(PROJECT), envFound: existsSync(join(PROJECT, '.env')) },
      system: { cpuCount: os.cpus().length, ...metrics },
    };
    this.last = snapshot;
    this.snapshotAt = Date.now();
    return snapshot;
  }

  async start(id) {
    const service = this.services[id];
    if (!service) throw new Error('Serviço desconhecido.');
    const current = await this.serviceState(service, true);
    this.snapshotAt = 0;
    if (current.pids.length) return { changed: false, reason: 'Já está ativo.' };
    const child = spawn(service.command, service.args, { cwd: service.cwd, env: service.env || process.env, windowsHide: true, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    await new Promise((resolve, reject) => {
      child.once('spawn', resolve);
      child.once('error', error => { this.event(service.label, 'error', error.message); reject(new Error('Não foi possível iniciar '+service.label+'. Verifique se o programa está instalado.')); });
    });
    child.unref();
    this.invalidate();
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
    const current = await this.serviceState(service, true);
    this.snapshotAt = 0;
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
    this.invalidate();
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

  invalidate() { this.snapshotAt = 0; this.inventory.updatedAt = 0; this.inventory.metadataAt = 0; }
  async refresh() { this.snapshotAt = 0; return this.snapshot(); }
  async restartProcess(id) { await this.stop(id); await new Promise(resolve => setTimeout(resolve, 800)); return this.start(id); }
  async recover(id) {
    if (id !== 'whatsappWorker') return this.restartProcess(id);
    try {
      const response = await fetch('http://127.0.0.1:4100/restart', {
        method:'POST', headers:{authorization:'Bearer '+(this.whatsAppEnv.WORKER_SECRET || ''),'content-type':'application/json'},
        body:JSON.stringify({accountId:this.whatsAppEnv.ACCOUNT_ID,userId:this.whatsAppEnv.USER_ID}), signal:AbortSignal.timeout(25_000),
      });
      const result = await response.json().catch(()=>null);
      if (response.ok && result?.status && (result.status.connected || result.status.state==='qr' || result.status.state==='starting' || result.status.isStarting)) {
        this.invalidate(); return {message:'Recuperação da sessão iniciada. Aguarde a atualização do estado.'};
      }
    } catch { /* A stuck session requires a bounded process restart. */ }
    await this.restartProcess(id);
    return {message:'Processo do WhatsApp reiniciado com a autenticação guardada preservada.'};
  }
  async startMissing() {
    for (const id of ['aiWorker','aiTunnel','whatsappWorker','whatsappTunnel']) await this.start(id);
    return {message:'Serviços desligados verificados e iniciados. Os processos já ativos foram mantidos.'};
  }
  async recoverFailed() {
    const states = await Promise.all(Object.values(this.services).map(service=>this.serviceState(service)));
    const failed = states.filter(service=>!service.health.ok);
    for (const state of failed) {
      if (!state.pids.length) await this.start(state.id); else await this.recover(state.id);
    }
    return {message:failed.length ? 'Recuperação pedida para '+failed.length+' serviço(s) com falha.' : 'Não foram encontradas falhas nos serviços locais.'};
  }
  async qr() {
    const probe = await this.probeHttp('http://127.0.0.1:4100/status?autostart=false&account_id='+encodeURIComponent(this.whatsAppEnv.ACCOUNT_ID||'')+'&user_id='+encodeURIComponent(this.whatsAppEnv.USER_ID||''), {authorization:'Bearer '+(this.whatsAppEnv.WORKER_SECRET||'')});
    if (!probe.ok) throw new Error('Não foi possível consultar o QR. Inicie ou recupere primeiro o WhatsApp.');
    return {qr:typeof probe.body.qr==='string' && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(probe.body.qr) ? probe.body.qr : null, connected:!!probe.body.connected, message:this.redact(sessionAdvice(probe.body).detail)};
  }
  diagnose() {
    if (this.diagnosticPending) return this.diagnosticPending;
    this.diagnosticPending = this.collectDiagnostics().finally(()=>{this.diagnosticPending=null;});
    return this.diagnosticPending;
  }
  async collectDiagnostics() {
    const checks = [];
    const check = async (id,label,url,headers={},session=false) => {
      const started=Date.now();
      if (!url) { checks.push({id,label,ok:false,detail:'Endereço não configurado.'}); return; }
      const probe=await this.probeHttp(url,headers);
      checks.push({id,label,ok:probe.ok && (!session || !!probe.body.connected),latencyMs:Date.now()-started,
        detail:probe.ok ? (session ? sessionAdvice(probe.body).detail : 'Resposta HTTP '+probe.status) : (probe.status ? 'HTTP '+probe.status : 'Sem resposta dentro do tempo limite.')});
    };
    const w=this.whatsAppEnv, a=this.rootEnv;
    const waQuery='?autostart=false&account_id='+encodeURIComponent(w.ACCOUNT_ID||'')+'&user_id='+encodeURIComponent(w.USER_ID||'');
    await Promise.all([
      check('wa-local','WhatsApp local','http://127.0.0.1:4100/status'+waQuery,{authorization:'Bearer '+(w.WORKER_SECRET||'')},true),
      check('wa-public','WhatsApp pelo túnel',a.WHATSAPP_WORKER_URL ? a.WHATSAPP_WORKER_URL.replace(/\/+$/,'')+'/status'+waQuery : null,{authorization:'Bearer '+(a.WHATSAPP_WORKER_SECRET||'')},true),
      check('ai-local','API de IA local','http://127.0.0.1:3002/status',{authorization:'Bearer '+(a.AI_WORKER_SECRET||'')}),
      check('ai-public','IA pelo túnel',a.AI_WORKER_URL ? a.AI_WORKER_URL.replace(/\/+$/,'')+'/status' : null,{authorization:'Bearer '+(a.AI_WORKER_SECRET||'')}),
      check('ollama','Motor Ollama','http://127.0.0.1:11434/api/tags'),
    ]);
    const loaded=await this.probeHttp('http://127.0.0.1:11434/api/ps');
    let scheduler={found:false,detail:'Não foi possível consultar o agendador.'};
    try {
      const raw=await powershell("$ErrorActionPreference='Stop'; $task=Get-ScheduledTask -TaskName 'JP Massagem - Lembretes da agenda' -ErrorAction SilentlyContinue; if($task){$info=$task | Get-ScheduledTaskInfo; @{found=$true;state=[string]$task.State;lastRun=$info.LastRunTime.ToUniversalTime().ToString('o');nextRun=$info.NextRunTime.ToUniversalTime().ToString('o');lastResult=$info.LastTaskResult} | ConvertTo-Json -Compress}else{@{found=$false} | ConvertTo-Json -Compress}");
      scheduler=JSON.parse(raw);
    } catch { /* Read-only diagnostics never trigger reminder dispatch. */ }
    this.diagnosticResult={checkedAt:new Date().toISOString(),checks:checks.map(row=>({...row,detail:this.redact(row.detail)})),
      models:(loaded.body.models||[]).map(model=>({name:model.name,size:Number(model.size||0),expiresAt:model.expires_at})),scheduler};
    this.snapshotAt=0;
    this.event('Diagnóstico','info','Verificação local e externa concluída. '+checks.filter(row=>row.ok).length+' de '+checks.length+' verificações responderam sem falha.');
    return this.diagnosticResult;
  }
  async testAi() {
    const tags=await this.probeHttp('http://127.0.0.1:11434/api/tags');
    const model=tags.body.models?.[0]?.name;
    if (!model) throw new Error('O Ollama não apresentou um modelo instalado.');
    const started=Date.now();
    const response=await fetch('http://127.0.0.1:3002/ai/chat',{method:'POST',headers:{authorization:'Bearer '+(this.rootEnv.AI_WORKER_SECRET||''),'content-type':'application/json'},body:JSON.stringify({model,messages:[{role:'user',content:'Responde apenas OK.'}],max_completion_tokens:12,timeout_ms:30000}),signal:AbortSignal.timeout(35000)});
    const result=await response.json().catch(()=>null);
    if (!response.ok || !result?.choices?.[0]?.message?.content) throw new Error(this.redact(result?.error || 'A IA não conseguiu produzir uma resposta de teste.'));
    return {message:'IA respondeu em '+((Date.now()-started)/1000).toFixed(1)+' s com '+model+'. Nenhuma mensagem foi enviada a clientes.'};
  }
}

module.exports = { Supervisor, PROJECT, LOG_DIR };
