const {
  app, BrowserWindow, ipcMain, globalShortcut, Tray, Menu,
  nativeImage, powerSaveBlocker, session
} = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const {
  cleanSchedule, findOverlappingPair, isSameOriginUrl,
  lastRunDateAfterEdit, localDateKey, normalizeShortcut, shortcutCandidates, shouldStart
} = require('./logic');

const hasSingleInstanceLock = app.requestSingleInstanceLock();

let mainWindow;
let focusWindow;
let tray;
let isQuitting = false;
let currentFocus = null;
let powerBlockerId = null;
let scheduleTimer = null;
let focusEndTimer = null;
let allowFocusClose = false;
let activeShortcut = null;
let startupShortcutNotice = '';
let pendingEndNotice = null;
let focusWebSessionConfigured = false;

function userFile(name) {
  return path.join(app.getPath('userData'), name);
}

function readJson(name, fallback) {
  try {
    return JSON.parse(fs.readFileSync(userFile(name), 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(name, value) {
  fs.mkdirSync(path.dirname(userFile(name)), { recursive: true });
  fs.writeFileSync(userFile(name), JSON.stringify(value, null, 2), 'utf8');
}

function readSchedules() {
  const saved = readJson('schedules.json', []);
  return Array.isArray(saved) ? saved.map(cleanSchedule) : [];
}

function saveSchedules(schedules) {
  const previousById = new Map(readSchedules().map((schedule) => [schedule.id, schedule]));
  const cleaned = Array.isArray(schedules) ? schedules.map(cleanSchedule).map((schedule) => ({
    ...schedule,
    lastRunDate: lastRunDateAfterEdit(previousById.get(schedule.id), schedule)
  })) : [];
  const overlap = findOverlappingPair(cleaned);
  if (overlap) {
    return {
      ok: false,
      schedules: readSchedules(),
      message: `「${overlap[0].title}」和「${overlap[1].title}」的時間重疊，請先調整其中一個排程。`
    };
  }
  writeJson('schedules.json', cleaned);
  return { ok: true, schedules: cleaned };
}

function readSettings() {
  const saved = readJson('settings.json', {});
  return { shortcut: normalizeShortcut(saved.shortcut) };
}

function shortcutLabel(shortcut) {
  return shortcut.replace('CommandOrControl', 'Ctrl').replaceAll('+', ' + ');
}

function currentShortcutSettings(message = '') {
  const shortcutEnabled = Boolean(activeShortcut && globalShortcut.isRegistered(activeShortcut));
  return {
    shortcut: shortcutEnabled ? activeShortcut : readSettings().shortcut,
    shortcutEnabled,
    message
  };
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.show();
  mainWindow.restore();
  mainWindow.focus();
}

function registerOpeningShortcut(requestedShortcut, save = false) {
  const nextShortcut = normalizeShortcut(requestedShortcut);
  if (nextShortcut === activeShortcut && globalShortcut.isRegistered(nextShortcut)) {
    return { ok: true, ...currentShortcutSettings() };
  }

  const previousShortcut = activeShortcut && globalShortcut.isRegistered(activeShortcut)
    ? activeShortcut
    : null;
  if (previousShortcut) globalShortcut.unregister(previousShortcut);
  const registered = globalShortcut.register(nextShortcut, showMainWindow);

  if (!registered) {
    const restored = previousShortcut
      ? globalShortcut.register(previousShortcut, showMainWindow)
      : false;
    activeShortcut = restored ? previousShortcut : null;
    const result = {
      ok: false,
      ...currentShortcutSettings(),
      message: restored
        ? '這組快捷鍵已被其他程式使用，原本的快捷鍵會繼續生效。'
        : '這組快捷鍵已被其他程式使用，目前沒有啟用快捷鍵，請改選其他組合。'
    };
    mainWindow?.webContents.send('settings-changed', result);
    return result;
  }

  activeShortcut = nextShortcut;
  if (save) writeJson('settings.json', { shortcut: activeShortcut });
  const result = { ok: true, ...currentShortcutSettings() };
  mainWindow?.webContents.send('settings-changed', result);
  return result;
}

function registerStartupShortcut(savedShortcut) {
  const preferred = normalizeShortcut(savedShortcut);
  const candidates = shortcutCandidates(preferred);

  for (const candidate of candidates) {
    if (!globalShortcut.register(candidate, showMainWindow)) continue;
    activeShortcut = candidate;
    if (candidate !== preferred) {
      writeJson('settings.json', { shortcut: candidate });
      startupShortcutNotice = `原本的快捷鍵 ${shortcutLabel(preferred)} 已被占用，已自動改用 ${shortcutLabel(candidate)}。`;
    }
    return;
  }

  activeShortcut = null;
  startupShortcutNotice = '四組快捷鍵目前都被其他程式占用，因此快捷鍵未啟用；請關閉衝突程式後重新選擇。';
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1040,
    height: 800,
    minWidth: 820,
    minHeight: 650,
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
  mainWindow.webContents.once('did-finish-load', () => {
    if (!startupShortcutNotice) return;
    mainWindow.webContents.send('app-message', startupShortcutNotice);
    startupShortcutNotice = '';
  });
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'icon.png')).resize({ width: 24, height: 24 });
  tray = new Tray(icon);
  tray.setToolTip('專注番茄鐘');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打開專注番茄鐘', click: showMainWindow },
    { type: 'separator' },
    {
      label: '結束程式',
      click: () => {
        isQuitting = true;
        endFocus('app-quit');
        app.quit();
      }
    }
  ]));
  tray.on('double-click', showMainWindow);
}

function sendFocusNotice(message, type = 'info') {
  if (focusWindow && !focusWindow.isDestroyed()) {
    focusWindow.webContents.send('focus-notice', { message, type });
  }
}

app.on('web-contents-created', (_event, contents) => {
  if (contents.getType() !== 'webview') return;
  contents.setWindowOpenHandler(() => {
    sendFocusNotice('已阻止網站開啟新視窗。', 'warning');
    return { action: 'deny' };
  });
});

function configureFocusSession() {
  if (focusWebSessionConfigured) return;
  const focusSession = session.fromPartition('focus-web');
  focusSession.setPermissionCheckHandler(() => false);
  focusSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  focusSession.on('will-download', (event) => {
    event.preventDefault();
    sendFocusNotice('已阻止網站下載檔案。', 'warning');
  });
  focusWebSessionConfigured = true;
}

function isPreviewExit(input) {
  return input.key === 'Escape' ||
    (input.shift && !input.control && !input.alt && input.key.toLowerCase() === 's');
}

function secureWebview(window) {
  window.webContents.on('will-attach-webview', (event, webPreferences, params) => {
    delete webPreferences.preload;
    webPreferences.preload = path.join(__dirname, 'focus-web-preload.js');
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.devTools = false;

    try {
      if (!['http:', 'https:'].includes(new URL(params.src).protocol)) event.preventDefault();
    } catch {
      event.preventDefault();
    }
  });

  window.webContents.on('did-attach-webview', (_event, guestContents) => {
    guestContents.on('ipc-message', (_ipcEvent, channel) => {
      if (channel === 'focus:web-popup-blocked') {
        sendFocusNotice('已阻止網站開啟新視窗。', 'warning');
      }
    });

    const blockCrossOriginNavigation = (event, legacyUrl) => {
      const nextUrl = event?.url || legacyUrl || '';
      if (currentFocus?.url && !isSameOriginUrl(currentFocus.url, nextUrl)) {
        event.preventDefault();
        sendFocusNotice('已阻止跳到其他網站，專注頁面會留在原本網域。', 'warning');
      }
    };

    guestContents.on('will-navigate', blockCrossOriginNavigation);
    guestContents.on('will-redirect', blockCrossOriginNavigation);

    guestContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
      if (isMainFrame && errorCode !== -3) {
        window.webContents.send('focus-load-failed', {
          message: `網頁載入失敗：${errorDescription || '請檢查網路或網址'}`,
          url: validatedUrl
        });
      }
    });

    guestContents.on('before-input-event', (event, input) => {
      if (currentFocus?.preview && isPreviewExit(input)) {
        event.preventDefault();
        endFocus('preview-exit');
      }
    });

    guestContents.on('context-menu', (event) => {
      event.preventDefault();
      if (currentFocus?.preview) endFocus('preview-exit');
    });
  });
}

function clearFocusEndTimer() {
  if (focusEndTimer) clearTimeout(focusEndTimer);
  focusEndTimer = null;
}

function scheduleFocusEnd() {
  clearFocusEndTimer();
  const remaining = Math.max(0, currentFocus.endsAt - Date.now());
  focusEndTimer = setTimeout(() => endFocus('completed'), remaining);
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
  allowFocusClose = preview;
  pendingEndNotice = null;

  try {
    configureFocusSession();
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
  } catch {
    focusWindow = null;
    currentFocus = null;
    allowFocusClose = false;
    return { ok: false, message: '專注畫面建立失敗，排程尚未標記為已執行。' };
  }

  focusWindow.setMenu(null);
  secureWebview(focusWindow);
  if (!preview) {
    focusWindow.setAlwaysOnTop(true, 'screen-saver');
    focusWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }
  focusWindow.loadFile('focus.html');

  focusWindow.webContents.on('before-input-event', (event, input) => {
    if (preview && isPreviewExit(input)) {
      event.preventDefault();
      endFocus('preview-exit');
      return;
    }
    const blocked = input.key === 'Escape' || input.key === 'F11' ||
      (input.alt && input.key === 'F4') || (input.control && input.key.toLowerCase() === 'w');
    if (!preview && blocked) event.preventDefault();
  });

  focusWindow.webContents.on('context-menu', (event) => {
    event.preventDefault();
    if (preview) endFocus('preview-exit');
  });

  focusWindow.on('blur', () => {
    setTimeout(() => {
      if (focusWindow && !focusWindow.isDestroyed() && !currentFocus?.preview) focusWindow.focus();
    }, 150);
  });

  focusWindow.on('close', (event) => {
    if (!allowFocusClose && !isQuitting) event.preventDefault();
  });

  focusWindow.on('closed', () => {
    clearFocusEndTimer();
    focusWindow = null;
    currentFocus = null;
    allowFocusClose = false;
    if (powerBlockerId !== null && powerSaveBlocker.isStarted(powerBlockerId)) {
      powerSaveBlocker.stop(powerBlockerId);
    }
    powerBlockerId = null;
    mainWindow?.webContents.send('focus-status-changed', pendingEndNotice || { reason: 'closed' });
    pendingEndNotice = null;
  });

  powerBlockerId = powerSaveBlocker.start('prevent-display-sleep');
  scheduleFocusEnd();
  return { ok: true };
}

function endFocus(reason = 'completed') {
  if (!focusWindow || focusWindow.isDestroyed()) return;
  pendingEndNotice = {
    reason,
    shouldRest: reason === 'completed' && currentFocus?.duration >= 60
  };
  clearFocusEndTimer();
  allowFocusClose = true;
  focusWindow.close();
}

function checkSchedules() {
  if (focusWindow) return;
  const now = new Date();
  const schedules = readSchedules();
  const due = schedules.find((schedule) => shouldStart(schedule, now));
  if (!due) return;

  const result = startFocus(due, { preview: false });
  if (result.ok) {
    due.lastRunDate = localDateKey(now);
    writeJson('schedules.json', schedules);
    mainWindow?.webContents.send('schedules-changed');
  } else {
    mainWindow?.webContents.send('app-message', result.message);
  }
}

function registerMessages() {
  ipcMain.handle('schedules:get', () => readSchedules());
  ipcMain.handle('schedules:save', (_event, schedules) => saveSchedules(schedules));
  ipcMain.handle('focus:start', (_event, schedule) => startFocus(schedule, { preview: true }));
  ipcMain.handle('focus:get-current', () => currentFocus);
  ipcMain.handle('focus:emergency-unlock', () => endFocus('emergency'));
  ipcMain.handle('settings:get', () => currentShortcutSettings());
  ipcMain.handle('settings:set-shortcut', (_event, shortcut) => registerOpeningShortcut(shortcut, true));
}

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', showMainWindow);

  app.whenReady().then(() => {
    registerMessages();
    const savedShortcut = readSettings().shortcut;
    registerStartupShortcut(savedShortcut);
    createMainWindow();
    createTray();

    scheduleTimer = setInterval(checkSchedules, 1000);
    checkSchedules();
  });
}

app.on('before-quit', () => {
  isQuitting = true;
  allowFocusClose = true;
  clearInterval(scheduleTimer);
  clearFocusEndTimer();
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => {});
