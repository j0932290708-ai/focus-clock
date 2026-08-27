const { app, BrowserWindow, ipcMain, globalShortcut, Tray, Menu, nativeImage, powerSaveBlocker } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { cleanSchedule, localDateKey, shouldStart } = require('./logic');

let mainWindow;
let focusWindow;
let tray;
let isQuitting = false;
let currentFocus = null;
let powerBlockerId = null;
let scheduleTimer = null;

function dataFile() {
  return path.join(app.getPath('userData'), 'schedules.json');
}

function readSchedules() {
  try {
    const saved = JSON.parse(fs.readFileSync(dataFile(), 'utf8'));
    return Array.isArray(saved) ? saved.map(cleanSchedule) : [];
  } catch {
    return [];
  }
}

function writeSchedules(schedules) {
  const cleaned = Array.isArray(schedules) ? schedules.map(cleanSchedule) : [];
  fs.mkdirSync(path.dirname(dataFile()), { recursive: true });
  fs.writeFileSync(dataFile(), JSON.stringify(cleaned, null, 2), 'utf8');
  return cleaned;
}

function showMainWindow() {
  if (!mainWindow) return;
  mainWindow.show();
  mainWindow.restore();
  mainWindow.focus();
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1040,
    height: 760,
    minWidth: 820,
    minHeight: 620,
    backgroundColor: '#f7f3eb',
    title: '專注番茄鐘',
    icon: path.join(__dirname, 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile('index.html');

  // 按關閉時先縮到右下角，排程才可以繼續等待。
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function makeTrayIcon() {
  return nativeImage.createFromPath(path.join(__dirname, 'icon.png')).resize({ width: 24, height: 24 });
}

function createTray() {
  tray = new Tray(makeTrayIcon());
  tray.setToolTip('專注番茄鐘');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打開專注番茄鐘', click: showMainWindow },
    { type: 'separator' },
    {
      label: '結束程式',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]));
  tray.on('double-click', showMainWindow);
}

function secureWebview(window) {
  window.webContents.on('will-attach-webview', (event, webPreferences, params) => {
    delete webPreferences.preload;
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;

    try {
      const protocol = new URL(params.src).protocol;
      if (!['http:', 'https:'].includes(protocol)) event.preventDefault();
    } catch {
      event.preventDefault();
    }
  });

  // 網頁本身也要能收到安全退出操作，避免滑鼠停在網頁上時失效。
  window.webContents.on('did-attach-webview', (_event, guestContents) => {
    guestContents.on('before-input-event', (event, input) => {
      if (input.shift && !input.control && !input.alt && input.key.toLowerCase() === 's') {
        event.preventDefault();
        endFocus();
      }
    });
    guestContents.on('context-menu', () => endFocus());
    guestContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  });
}

function startFocus(rawSchedule, options = {}) {
  if (focusWindow) return { ok: false, message: '目前已有一個專注時鐘正在進行。' };

  const schedule = cleanSchedule(rawSchedule);
  const preview = options.preview === true;
  const startedAt = Date.now();
  currentFocus = {
    ...schedule,
    preview,
    startedAt,
    endsAt: startedAt + schedule.duration * 60 * 1000
  };

  focusWindow = new BrowserWindow({
    fullscreen: true,
    kiosk: !preview,
    alwaysOnTop: !preview,
    skipTaskbar: !preview,
    backgroundColor: '#17211c',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'focus-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      devTools: false
    }
  });

  secureWebview(focusWindow);
  if (!preview) {
    focusWindow.setAlwaysOnTop(true, 'screen-saver');
    focusWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }
  focusWindow.loadFile('focus.html');

  // Shift + S 與滑鼠右鍵是隨時可用的安全退出方式。
  focusWindow.webContents.on('before-input-event', (event, input) => {
    if (input.shift && !input.control && !input.alt && input.key.toLowerCase() === 's') {
      event.preventDefault();
      endFocus();
      return;
    }

    if (preview && input.key === 'Escape') {
      event.preventDefault();
      endFocus();
      return;
    }

    const blocked = input.key === 'Escape' || input.key === 'F11' ||
      (input.alt && input.key === 'F4') || (input.control && input.key.toLowerCase() === 'w');
    if (!preview && blocked) event.preventDefault();
  });
  focusWindow.webContents.on('context-menu', () => endFocus());

  focusWindow.on('blur', () => {
    setTimeout(() => {
      if (focusWindow && !focusWindow.isDestroyed() && !currentFocus?.preview) focusWindow.focus();
    }, 150);
  });

  focusWindow.on('closed', () => {
    focusWindow = null;
    currentFocus = null;
    if (powerBlockerId !== null && powerSaveBlocker.isStarted(powerBlockerId)) {
      powerSaveBlocker.stop(powerBlockerId);
    }
    powerBlockerId = null;
    mainWindow?.webContents.send('focus-status-changed');
  });

  powerBlockerId = powerSaveBlocker.start('prevent-display-sleep');
  return { ok: true };
}

function endFocus() {
  if (focusWindow && !focusWindow.isDestroyed()) focusWindow.close();
}

function checkSchedules() {
  if (focusWindow) return;
  const now = new Date();
  const schedules = readSchedules();
  const due = schedules.find((schedule) => shouldStart(schedule, now));
  if (!due) return;

  due.lastRunDate = localDateKey(now);
  writeSchedules(schedules);
  startFocus(due);
  mainWindow?.webContents.send('schedules-changed');
}

function registerMessages() {
  ipcMain.handle('schedules:get', () => readSchedules());
  ipcMain.handle('schedules:save', (_event, schedules) => writeSchedules(schedules));
  ipcMain.handle('focus:start', (_event, schedule) => startFocus(schedule, { preview: true }));
  ipcMain.handle('focus:get-current', () => currentFocus);
  ipcMain.handle('focus:complete', () => endFocus());
  ipcMain.handle('focus:emergency-unlock', () => endFocus());
  ipcMain.handle('app:show', () => showMainWindow());
}

app.whenReady().then(() => {
  registerMessages();
  createMainWindow();
  createTray();

  globalShortcut.register('CommandOrControl+Alt+P', showMainWindow);
  scheduleTimer = setInterval(checkSchedules, 1000);
  checkSchedules();
});

app.on('before-quit', () => {
  isQuitting = true;
  clearInterval(scheduleTimer);
});

app.on('will-quit', () => globalShortcut.unregisterAll());

// 即使主畫面縮到右下角，也保持程式運作，等待下一個排程。
app.on('window-all-closed', () => {});
