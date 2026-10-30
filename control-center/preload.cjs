const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('controlCenter', {
  snapshot: () => ipcRenderer.invoke('control:snapshot'),
  action: (action, id) => ipcRenderer.invoke('control:action', action, id),
  openLogs: () => ipcRenderer.invoke('control:open-logs'),
  export: () => ipcRenderer.invoke('control:export'),
  onSnapshot: (callback) => {
    const listener = (_event, snapshot) => callback(snapshot);
    ipcRenderer.on('control:snapshot', listener);
    return () => ipcRenderer.removeListener('control:snapshot', listener);
  },
});
