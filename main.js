const {
  app, BrowserWindow, ipcMain, globalShortcut, Tray, Menu,
  nativeImage, powerSaveBlocker, session
} = require('electron');
const path = require('node:path');
const { createStore } = require('./storage');
const { disposeFocusWindow } = require('./focus-window');
const { isTrustedSender, hasSafePayload } = require('./security');
const {
  cleanSchedule, findOverlappingPair, isSameOriginUrl,
  lastRunDateAfterEdit, normalizeShortcut, shortcutCandidates, dueOccurrence,
  normalizeUrl, decodeSchedules, validateSchedules, scheduleDocument, ALLOWED_SHORTCUTS
} = require('./logic');

const hasSingleInstanceLock = app.requestSingleInstanceLock();

let mainWindow;
let focusWindow;
let tray;
let isQuitting = false;
let storesFlushed = false;
let flushingStores = false;
let currentFocus = null;
let powerBlockerId = null;
let scheduleTimer = null;
let focusEndTimer = null;
let allowFocusClose = false;
let activeShortcut = null;
let startupShortcutNotice = '';
let pendingEndNotice = null;
let focusWebSessionConfigured = false;
let schedulesStore;
let settingsStore;
let polling = false;
const launched = new Set();
const startupWarnings = [];
function reportWarning(message) {
  startupWarnings.push(message);
  if (startupWarnings.length > 20) startupWarnings.shift();
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('app-message', message);
}

function userFile(name) {
  return path.join(app.getPath('userData'), name);
}

function readSchedules() {
  return schedulesStore.read().schedules;
}

async function saveSchedules(schedules) {
  const cleaned = validateSchedules(schedules);
  const overlap = findOverlappingPair(cleaned);
  if (overlap) {
    return {
      ok: false,
      schedules: readSchedules(),
      message: `「${overlap[0].title}」和「${overlap[1].title}」的時間重疊，請先調整其中一個排程。`
    };
  }
  const saved = await schedulesStore.update((previous) => {
    const previousById = new Map(previous.schedules.map((row) => [row.id, row]));
    return scheduleDocument(cleaned.map((row) => ({ ...row, lastRunDate: lastRunDateAfterEdit(previousById.get(row.id), row) })));
  });
  return { ok: true, schedules: saved.schedules };
}

function readSettings() {
  const saved = settingsStore.read();
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

async function registerOpeningShortcut(requestedShortcut, save = false) {
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
  if (save) {
    try { await settingsStore.update(() => ({ shortcut: activeShortcut })); }
    catch {
      globalShortcut.unregister(nextShortcut);
      activeShortcut = previousShortcut && globalShortcut.register(previousShortcut, showMainWindow) ? previousShortcut : null;
      return { ok: false, ...currentShortcutSettings(), message: '快捷鍵設定無法保存，已還原原本設定。' };
    }
  }
  const result = { ok: true, ...currentShortcutSettings() };
  mainWindow?.webContents.send('settings-changed', result);
  return result;
}

async function registerStartupShortcut(savedShortcut) {
  const preferred = normalizeShortcut(savedShortcut);
  const candidates = shortcutCandidates(preferred);

  for (const candidate of candidates) {
    if (!globalShortcut.register(candidate, showMainWindow)) continue;
    activeShortcut = candidate;
    if (candidate !== preferred) {
      try { await settingsStore.update(() => ({ shortcut: candidate })); }
      catch { reportWarning('替代快捷鍵本次有效，但無法保存至磁碟。'); }
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
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.loadFile('index.html');
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  mainWindow.webContents.once('did-finish-load', () => {
    startupWarnings.forEach((message) => mainWindow.webContents.send('app-message', message));
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
  focusSession.setCertificateVerifyProc((_request, callback) => callback(-3));
  focusSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'ws://*/*'] }, (_details, callback) => callback({ cancel: true }));
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
    webPreferences.sandbox = true;
    webPreferences.webSecurity = true;
    webPreferences.allowRunningInsecureContent = false;
    webPreferences.nodeIntegrationInSubFrames = false;
    webPreferences.partition = 'focus-web';
    webPreferences.devTools = false;
    params.allowpopups = false;

    try {
      if (!currentFocus?.url || !isSameOriginUrl(currentFocus.url, params.src)) event.preventDefault();
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
    guestContents.on('will-frame-navigate', blockCrossOriginNavigation);
    guestContents.on('render-process-gone', () => {
      window.webContents.send('focus-load-failed', { message: '專注網站已停止回應，倒數仍會繼續。' });
    });

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
  if (rawSchedule?.url && !normalizeUrl(rawSchedule.url)) return { ok: false, message: '專注網址只接受 HTTPS。' };

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
        sandbox: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
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
  focusWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  focusWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  focusWindow.webContents.on('render-process-gone', () => endFocus('renderer-failed'));
  secureWebview(focusWindow);
  if (!preview) {
    focusWindow.setAlwaysOnTop(true, 'screen-saver');
    focusWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }
  focusWindow.loadFile('focus.html').catch(() => endFocus('load-failed'));

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
  disposeFocusWindow(focusWindow);
}

async function checkSchedules() {
  if (focusWindow || polling) return;
  const now = new Date();
  const schedules = readSchedules();
  const due = schedules.find((schedule) => {
    const occurrence = dueOccurrence(schedule, now);
    return occurrence && !launched.has(occurrence.key);
  });
  if (!due) return;

  const result = startFocus(due, { preview: false });
  if (result.ok) {
    const occurrence = dueOccurrence(due, now);
    launched.add(occurrence.key);
    polling = true;
    try {
      await schedulesStore.update((saved) => scheduleDocument(saved.schedules.map((row) => row.id === due.id && row.time === due.time ? { ...row, lastRunDate: occurrence.runDate } : row)));
      mainWindow?.webContents.send('schedules-changed');
    } catch {
      reportWarning('本次專注已啟動，但執行紀錄無法保存；本次程式執行期間不會重複啟動。');
      sendFocusNotice('執行紀錄無法保存，請在結束後檢查磁碟。', 'warning');
    } finally { polling = false; }
  } else {
    mainWindow?.webContents.send('app-message', result.message);
  }
}

function registerMessages() {
  function handle(channel, scope, callback) {
    ipcMain.handle(channel, async (event, payload) => {
      const window = scope === 'main' ? mainWindow : focusWindow;
      const file = path.join(__dirname, scope === 'main' ? 'index.html' : 'focus.html');
      if (!isTrustedSender(event, window, file) || !hasSafePayload(payload)) {
        console.warn(`[IPC] rejected ${channel}`); // 只記錄通道，不記錄網址與使用者資料。
        return { ok: false, code: 'UNTRUSTED_SENDER', message: '此視窗沒有操作權限。' };
      }
      if (isQuitting) return { ok: false, code: 'APP_CLOSING', message: '程式正在關閉，請重新開啟後再操作。' };
      try { return await callback(payload); }
      catch (error) {
        return { ok: false, code: 'INVALID_OR_UNSAVED', schedules: readSchedules(), message: error.code ? '資料無法保存，請檢查磁碟與權限；原排程仍保留。' : error.message };
      }
    });
  }
  handle('schedules:get', 'main', () => readSchedules());
  handle('schedules:save', 'main', saveSchedules);
  handle('focus:start', 'main', (schedule) => startFocus(validateSchedules([schedule])[0], { preview: true }));
  handle('focus:get-current', 'focus', () => currentFocus);
  handle('focus:emergency-unlock', 'focus', () => endFocus('emergency'));
  handle('settings:get', 'main', () => currentShortcutSettings());
  handle('settings:set-shortcut', 'main', (shortcut) => {
    if (!ALLOWED_SHORTCUTS.includes(shortcut)) throw new Error('不支援這組快捷鍵。');
    return registerOpeningShortcut(shortcut, true);
  });
}

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', showMainWindow);

  app.whenReady().then(async () => {
    schedulesStore = await createStore(userFile('schedules.json'), scheduleDocument([]), (raw) => {
      const decoded = decodeSchedules(raw);
      if (decoded.message) reportWarning(decoded.message);
      return scheduleDocument(decoded.schedules);
    }, reportWarning);
    settingsStore = await createStore(userFile('settings.json'), {}, (raw) => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('快捷鍵設定損壞。');
      return { shortcut: normalizeShortcut(raw.shortcut) };
    }, reportWarning);
    registerMessages();
    const savedShortcut = readSettings().shortcut;
    await registerStartupShortcut(savedShortcut);
    createMainWindow();
    createTray();

    scheduleTimer = setInterval(checkSchedules, 1000);
    checkSchedules();
  }).catch((error) => { console.error('無法初始化資料儲存：', error.code || 'INIT_FAILED'); app.quit(); });
}

app.on('before-quit', (event) => {
  isQuitting = true;
  allowFocusClose = true;
  clearInterval(scheduleTimer);
  clearFocusEndTimer();
  // 等候已接受的寫入完成，再離開，避免關閉時只寫了一半。
  if (!storesFlushed) {
    event.preventDefault();
    if (flushingStores) return;
    flushingStores = true;
    Promise.allSettled([schedulesStore?.flush(), settingsStore?.flush()]).finally(() => {
      storesFlushed = true;
      app.quit();
    });
  }
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => {});
