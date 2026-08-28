const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('focusSession', {
  getCurrent: () => ipcRenderer.invoke('focus:get-current'),
  emergencyUnlock: () => ipcRenderer.invoke('focus:emergency-unlock'),
  onNotice: (callback) => ipcRenderer.on('focus-notice', (_event, detail) => callback(detail)),
  onLoadFailed: (callback) => ipcRenderer.on('focus-load-failed', (_event, detail) => callback(detail))
});
