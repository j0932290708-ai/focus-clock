const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('focusClock', {
  getSchedules: () => ipcRenderer.invoke('schedules:get'),
  saveSchedules: (schedules) => ipcRenderer.invoke('schedules:save', schedules),
  startFocus: (schedule) => ipcRenderer.invoke('focus:start', schedule),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setShortcut: (shortcut) => ipcRenderer.invoke('settings:set-shortcut', shortcut),
  onSchedulesChanged: (callback) => ipcRenderer.on('schedules-changed', () => callback()),
  onFocusStatusChanged: (callback) => ipcRenderer.on('focus-status-changed', (_event, detail) => callback(detail)),
  onSettingsChanged: (callback) => ipcRenderer.on('settings-changed', (_event, settings) => callback(settings)),
  onAppMessage: (callback) => ipcRenderer.on('app-message', (_event, message) => callback(message))
});
