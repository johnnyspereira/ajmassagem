const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const { join } = require('node:path');
const { Supervisor, LOG_DIR } = require('./supervisor.cjs');

let windowRef;
let timer;
let pendingAction = Promise.resolve();
const supervisor = new Supervisor();

function createWindow() {
  windowRef = new BrowserWindow({
    width: 1540,
    height: 960,
    minWidth: 1120,
    minHeight: 720,
    backgroundColor: '#071517',
    title: 'JP Massagem — Control Center',
    autoHideMenuBar: true,
    webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false },
  });
  windowRef.loadFile(join(__dirname, 'renderer', 'index.html'));
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
  ipcMain.handle('control:action', (_event, action, id) => {
    const result = pendingAction.then(async () => {
    if (action === 'start') return supervisor.start(id);
    if (action === 'stop') return supervisor.stop(id);
    if (action === 'restart') return supervisor.restart(id);
    if (action === 'restart-all') return supervisor.restartAll();
    if (action === 'stop-all') return supervisor.stopAll();
    if (action === 'clear-logs') return supervisor.clearView();
    if (action === 'quit') { app.quit(); return true; }
    throw new Error('Ação não suportada.');
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
