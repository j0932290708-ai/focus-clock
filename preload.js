const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('focusClock', {
  getSchedules: () => ipcRenderer.invoke('schedules:get'),
  saveSchedules: (schedules) => ipcRenderer.invoke('schedules:save', schedules),
  startFocus: (schedule) => ipcRenderer.invoke('focus:start', schedule),
  onSchedulesChanged: (callback) => ipcRenderer.on('schedules-changed', callback),
  onFocusStatusChanged: (callback) => ipcRenderer.on('focus-status-changed', callback)
});
