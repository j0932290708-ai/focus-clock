const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('focusSession', {
  getCurrent: () => ipcRenderer.invoke('focus:get-current'),
  complete: () => ipcRenderer.invoke('focus:complete'),
  emergencyUnlock: () => ipcRenderer.invoke('focus:emergency-unlock')
});
