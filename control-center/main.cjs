const { app, BrowserWindow, ipcMain, dialog, shell, clipboard } = require('electron');
const { join } = require('node:path');
const { readFileSync } = require('node:fs');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execFileAsync = promisify(execFile);
const { Supervisor, LOG_DIR } = require('./supervisor.cjs');
const { crmUrl } = require('./diagnostics.cjs');

let windowRef;
let timer;
let pendingAction = Promise.resolve();
let updateChecked = false;
const supervisor = new Supervisor();
const packageInfo = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));

function createWindow() {
  windowRef = new BrowserWindow({
    width: 1540,
    height: 960,
    minWidth: 780,
    minHeight: 580,
    backgroundColor: '#071517',
    title: 'JP Massagem — Control Center',
    autoHideMenuBar: true,
    webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false },
  });
  windowRef.loadFile(join(__dirname, 'renderer', 'index.html'));
  windowRef.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  windowRef.webContents.on('will-navigate', event => event.preventDefault());
  windowRef.on('closed', () => { windowRef = null; });
}

async function broadcastSnapshot() {
  if (!windowRef || windowRef.isDestroyed() || windowRef.isMinimized() || !windowRef.isVisible()) return;
  try {
    const snapshot = await supervisor.snapshot();
    if (windowRef && !windowRef.isDestroyed()) windowRef.webContents.send('control:snapshot', snapshot);
  } catch (error) {
    supervisor.event('Sistema', 'error', `Falha ao atualizar painel: ${error.message}`);
  }
}

async function poll() {
  await broadcastSnapshot();
  if (windowRef) timer = setTimeout(poll, 10_000);
}

const ownsInstance = app.requestSingleInstanceLock();
if (!ownsInstance) app.quit();
app.on('second-instance', () => {
  if (!windowRef) return;
  if (windowRef.isMinimized()) windowRef.restore();
  windowRef.show();
  windowRef.focus();
});

if (ownsInstance) app.whenReady().then(() => {
  createWindow();
  windowRef.on('restore', broadcastSnapshot);
  ipcMain.handle('control:snapshot', () => supervisor.snapshot());
  ipcMain.handle('control:config', () => ({
    version: packageInfo.version,
    brandName: supervisor.rootEnv.CRM_BRAND_NAME || 'Johnny Pereira - JP Designer CRM',
    brandShortName: supervisor.rootEnv.CRM_BRAND_SHORT_NAME || 'JP Designer CRM',
    supportEmail: supervisor.rootEnv.CRM_SUPPORT_EMAIL || '',
  }));
  ipcMain.handle('control:action', (event, action, id) => {
    if (event.sender !== windowRef?.webContents) throw new Error('Janela não autorizada.');
    const result = pendingAction.then(async () => {
      try {
        let output;
        if (['start','stop','restart','recover','restart-process'].includes(action) && !Object.hasOwn(supervisor.services, id)) throw new Error('Serviço inválido.');
        if (action === 'start') output = await supervisor.start(id);
        else if (action === 'stop') output = await supervisor.stop(id);
        else if (action === 'restart') output = await supervisor.restart(id);
        else if (action === 'recover') output = await supervisor.recover(id);
        else if (action === 'restart-process') output = await supervisor.restartProcess(id);
        else if (action === 'restart-all') output = await supervisor.restartAll();
        else if (action === 'start-missing') output = await supervisor.startMissing();
        else if (action === 'recover-failed') output = await supervisor.recoverFailed();
        else if (action === 'diagnose') output = await supervisor.diagnose();
        else if (action === 'qr') output = await supervisor.qr();
        else if (action === 'test-ai') output = await supervisor.testAi();
        else if (action === 'refresh') output = { message:'Estado atualizado.' };
        else if (action === 'restart-app') { app.relaunch(); app.exit(0); output = { message: 'Control Center a reiniciar.' }; }
        else if (action === 'stop-all') output = await supervisor.stopAll();
        else if (action === 'clear-logs') output = supervisor.clearView();
        else if (action === 'open-crm') { await shell.openExternal(crmUrl(supervisor.rootEnv.NEXT_PUBLIC_APP_URL || supervisor.rootEnv.NEXT_PUBLIC_SITE_URL,id)); output={message:'Área do CRM aberta no navegador.'}; }
        else if (action === 'copy-diagnostics') { clipboard.writeText(JSON.stringify(await supervisor.snapshot(),null,2)); output={message:'Diagnóstico copiado, sem QR nem credenciais.'}; }
        else if (action === 'check-update') {
          const response = await fetch('https://api.github.com/repos/johnnyspereira/ajmassagem/releases/latest', { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'JP-Designer-CRM-Control-Center' } });
          let release;
          if (response.ok) release = await response.json();
          else if (response.status === 404) {
            const tagsResponse = await fetch('https://api.github.com/repos/johnnyspereira/ajmassagem/tags', { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'JP-Designer-CRM-Control-Center' } });
            if (!tagsResponse.ok) throw new Error(`GitHub respondeu HTTP ${tagsResponse.status}.`);
            const tags = await tagsResponse.json();
            release = { tag_name: tags[0]?.name, html_url: `https://github.com/johnnyspereira/ajmassagem/releases/tag/${tags[0]?.name || ''}`, name: 'Tag publicada (release ainda não criada)' };
          } else throw new Error(`GitHub respondeu HTTP ${response.status}.`);
          output = { message: release.tag_name && release.tag_name !== `v${packageInfo.version}` ? `Atualização disponível: ${release.tag_name}.` : `O Control Center já está atualizado (${packageInfo.version}).`, version: packageInfo.version, latest: release.tag_name, url: release.html_url, notes: release.name || release.body || '' };
        }
        else if (action === 'download-update') {
          const response = await fetch('https://github.com/johnnyspereira/ajmassagem/archive/refs/heads/main.zip', { headers: { 'User-Agent': 'JP-Designer-CRM-Control-Center' } });
          if (!response.ok) throw new Error(`GitHub respondeu HTTP ${response.status}.`);
          const target = join(app.getPath('downloads'), 'jp-designer-crm-main.zip');
          require('node:fs').writeFileSync(target, Buffer.from(await response.arrayBuffer()));
          updateChecked = true;
          output = { message: `Atualização baixada para ${target}.`, path: target };
        }
        else if (action === 'install-update') {
          if (!updateChecked) throw new Error('Baixe primeiro a atualização pelo GitHub.');
          const script = join(__dirname, '..', 'scripts', 'apply-control-center-update.ps1');
          const installRoot = join(__dirname, '..');
          const child = require('node:child_process').spawn('powershell.exe', ['-NoProfile','-ExecutionPolicy','Bypass','-File',script,'-ZipPath',join(app.getPath('downloads'),'jp-designer-crm-main.zip'),'-InstallRoot',installRoot], { detached:true, windowsHide:true, stdio:'ignore' });
          child.unref();
          output = { message: 'Atualização instalada. O Control Center vai fechar e reabrir automaticamente.' };
          setTimeout(() => app.quit(), 500);
        }
        else if (action === 'setup') {
          const script = join(__dirname, '..', 'scripts', 'install-transfer-final.ps1');
          let ollama = 'não encontrado';
          try { const check = await execFileAsync('ollama.exe', ['--version'], { windowsHide:true, timeout: 10000 }); ollama = check.stdout.trim() || 'instalado'; } catch {
            try {
              await execFileAsync('winget.exe', ['install','--id','Ollama.Ollama','--exact','--accept-source-agreements','--accept-package-agreements'], { windowsHide:true, timeout: 10 * 60 * 1000, maxBuffer: 2 * 1024 * 1024 });
              ollama = 'instalado agora';
            } catch { ollama = 'não instalado (instale Ollama.Ollama pelo winget)'; }
          }
          const result = await execFileAsync('powershell.exe', ['-NoProfile','-ExecutionPolicy','Bypass','-File',script], { windowsHide:true, timeout: 15 * 60 * 1000, maxBuffer: 2 * 1024 * 1024 });
          output = { message: `Instalação concluída. Ollama: ${ollama}. Reinicie o Control Center para aplicar tudo.`, detail: result.stdout.slice(-2000) };
        }
        else if (action === 'end-shift') {
          await supervisor.stopAll();
          await execFileAsync('shutdown.exe', ['/s','/t','30','/c','JP Designer CRM: expediente encerrado.'], { windowsHide:true });
          output = { message: 'Workers encerrados. O portátil será desligado em 30 segundos.' };
        }
        else if (action === 'quit') { app.quit(); return {ok:true}; }
        else throw new Error('Ação não suportada.');
        return { ok:true, result:output, snapshot:await supervisor.refresh() };
      } catch (error) {
        const message=supervisor.redact(error.message || 'Não foi possível concluir a ação.');
        supervisor.event('Ação','error',message);
        return {ok:false,error:message};
      }
    });
    // Serialize actions so repeated clicks cannot stop a newly started service.
    pendingAction = result.catch(() => {});
    return result;
  });
  ipcMain.handle('control:open-logs', () => shell.openPath(LOG_DIR));
  ipcMain.handle('control:export', async () => {
    const snapshot = await supervisor.snapshot();
    const result = await dialog.showSaveDialog(windowRef, { defaultPath: `jp-massagem-diagnostico-${new Date().toISOString().slice(0, 10)}.json` });
    if (!result.canceled && result.filePath) require('node:fs').writeFileSync(result.filePath, JSON.stringify(snapshot, null, 2));
    return !result.canceled;
  });
  void poll();
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => clearTimeout(timer));
