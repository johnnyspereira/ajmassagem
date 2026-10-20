const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('controlCenter', {
  snapshot: () => ipcRenderer.invoke('control:snapshot'),
  action: (action, id) => ipcRenderer.invoke('control:action', action, id),
  openLogs: () => ipcRenderer.invoke('control:open-logs'),
  export: () => ipcRenderer.invoke('control:export'),
  onSnapshot: (callback) => ipcRenderer.on('control:snapshot', (_event, snapshot) => callback(snapshot)),
});
