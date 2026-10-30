const { app, BrowserWindow, ipcMain, dialog, shell, clipboard } = require('electron');
const { join } = require('node:path');
const { Supervisor, LOG_DIR } = require('./supervisor.cjs');
const { crmUrl } = require('./diagnostics.cjs');

let windowRef;
let timer;
let pendingAction = Promise.resolve();
const supervisor = new Supervisor();

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
        else if (action === 'stop-all') output = await supervisor.stopAll();
        else if (action === 'clear-logs') output = supervisor.clearView();
        else if (action === 'open-crm') { await shell.openExternal(crmUrl(supervisor.rootEnv.NEXT_PUBLIC_APP_URL || supervisor.rootEnv.NEXT_PUBLIC_SITE_URL,id)); output={message:'Área do CRM aberta no navegador.'}; }
        else if (action === 'copy-diagnostics') { clipboard.writeText(JSON.stringify(await supervisor.snapshot(),null,2)); output={message:'Diagnóstico copiado, sem QR nem credenciais.'}; }
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
