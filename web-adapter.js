(() => {
  if (window.focusClock) return;

  const logic = window.focusClockLogic;
  const schedulesKey = 'focus-clock-schedules';
  // Android 11 的舊版 System WebView 可能沒有 structuredClone；排程是純 JSON，
  // 使用相容的複製方式，避免儲存、開關與驗證按鈕整批失效。
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const changedListeners = [];
  const statusListeners = [];
  const messageListeners = [];
  let cachedSchedules = null;
  let dataWarning = '';
  let corruptNotPreserved = false;
  let starting = false;
  let runLedger = [];
  try { runLedger = JSON.parse(sessionStorage.getItem('focus-clock-runs') || '[]'); } catch {}
  if (!Array.isArray(runLedger)) runLedger = [];
  const launched = new Set(runLedger.filter((key) => typeof key === 'string'));

  function warn(message) {
    dataWarning = message;
    const element = document.querySelector('#data-warning');
    if (element) { element.textContent = message; element.hidden = !message; }
    messageListeners.forEach((callback) => callback(message));
  }
  let installPrompt = null;
  const isNativeAndroid = window.Capacitor?.isNativePlatform?.() === true;
  document.documentElement.dataset.platform = isNativeAndroid ? 'android' : 'web';

  const isStandalone = () => isNativeAndroid
    || window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;

  function showInstallHelp(message) {
    const help = document.querySelector('#install-help');
    if (!help) return;
    help.textContent = message;
    help.hidden = false;
  }

  async function installApp() {
    const button = document.querySelector('#install-app-button');
    if (isStandalone()) {
      button.textContent = '已安裝';
      button.disabled = true;
      showInstallHelp('番茄鐘已經安裝完成，可以從主畫面或桌面圖示開啟。');
      return;
    }

    if (installPrompt) {
      installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      installPrompt = null;
      button.dataset.installReady = 'false';
      if (choice.outcome === 'accepted') {
        button.textContent = '安裝完成';
        button.disabled = true;
        showInstallHelp('安裝完成，現在可以從主畫面或桌面圖示開啟番茄鐘。');
      }
      return;
    }

    const isiPhoneOrIPad = /iphone|ipad|ipod/i.test(navigator.userAgent);
    showInstallHelp(isiPhoneOrIPad
      ? 'iPhone／iPad：請用 Safari 開啟，按下方「分享」按鈕，再選「加入主畫面」與「新增」。'
      : '若沒有跳出安裝視窗，請開啟瀏覽器選單，選擇「安裝應用程式」或「加入主畫面」。');
  }

  function readSchedules() {
    if (cachedSchedules) return clone(cachedSchedules);
    let rawText = null;
    try {
      rawText = localStorage.getItem(schedulesKey);
      const saved = JSON.parse(rawText || '[]');
      const result = logic.decodeSchedules(saved);
      cachedSchedules = result.schedules;
      if (result.message) warn(result.message);
    } catch {
      // 留下損壞原文供復原，不記錄到 console 或傳到網站。
      if (rawText !== null) {
        try { localStorage.setItem(`${schedulesKey}-corrupt-${Date.now()}`, rawText); }
        catch { corruptNotPreserved = true; }
      }
      try {
        cachedSchedules = logic.decodeSchedules(JSON.parse(localStorage.getItem(`${schedulesKey}-backup`))).schedules;
        warn('排程資料損壞，已從上一版備份復原；原始資料尚未覆蓋。請先匯出備份。');
      } catch {
        cachedSchedules = [];
        warn('無法讀取排程，原始資料未刪除。請檢查儲存空間或匯入備份。');
      }
    }
    return clone(cachedSchedules);
  }

  function writeSchedules(schedules) {
    if (corruptNotPreserved) throw new Error('無法保留損壞原文。請先匯出可讀資料、釋放儲存空間並重新載入。');
    const previous = localStorage.getItem(schedulesKey);
    let validPrevious = false;
    try { logic.decodeSchedules(JSON.parse(previous)); validPrevious = Boolean(previous); } catch {}
    if (validPrevious) localStorage.setItem(`${schedulesKey}-backup`, previous);
    localStorage.setItem(schedulesKey, JSON.stringify(logic.scheduleDocument(schedules)));
    cachedSchedules = clone(schedules);
  }

  function beginFocus(schedule, preview, occurrence = null) {
    if (starting) return { ok: false, message: '專注畫面正在開啟。' };
    if (schedule?.url && !logic.normalizeUrl(schedule.url)) return { ok: false, message: '專注網址只接受 HTTPS。' };
    const cleaned = logic.cleanSchedule(schedule);
    const startedAt = Date.now();
    const snapshot = {
      ...cleaned,
      preview,
      startedAt,
      endsAt: startedAt + cleaned.duration * 60 * 1000,
      warning: dataWarning
    };
    try {
      sessionStorage.setItem('focus-clock-current', JSON.stringify(snapshot));
      if (occurrence) {
        const nextLedger = [...launched, occurrence.key].slice(-400);
        sessionStorage.setItem('focus-clock-runs', JSON.stringify(nextLedger));
        launched.add(occurrence.key);
      }
    } catch {
      try { sessionStorage.removeItem('focus-clock-current'); } catch {}
      return { ok: false, message: '無法保存本次倒數，請允許瀏覽器儲存資料後重試。' };
    }
    starting = true;
    setTimeout(() => location.assign('focus.html?web=1'), 0);
    return { ok: true };
  }

  window.focusClock = {
    getSchedules: async () => readSchedules(),
    saveSchedules: async (rawSchedules) => {
      let schedules;
      try { schedules = logic.validateSchedules(rawSchedules); }
      catch (error) { return { ok: false, schedules: readSchedules(), message: error.message }; }
      const previous = new Map(readSchedules().map((row) => [row.id, row]));
      schedules.forEach((row) => { row.lastRunDate = logic.lastRunDateAfterEdit(previous.get(row.id), row); });
      const overlap = logic.findOverlappingPair(schedules);
      if (overlap) {
        return {
          ok: false,
          schedules: readSchedules(),
          message: `「${overlap[0].title}」和「${overlap[1].title}」的時間重疊，請先調整其中一個排程。`
        };
      }
      try {
        writeSchedules(schedules);
      } catch {
        return { ok: false, schedules: readSchedules(), message: corruptNotPreserved ? '無法保留損壞原文，暫停覆寫。請先匯出備份、釋放儲存空間並重新載入。' : '無法儲存排程，請檢查瀏覽器儲存空間。' };
      }
      return { ok: true, schedules };
    },
    startFocus: async (schedule) => beginFocus(schedule, true),
    getSettings: async () => ({ shortcut: 'CommandOrControl+Alt+P', shortcutEnabled: false, message: '' }),
    setShortcut: async () => ({ ok: false, shortcut: '', shortcutEnabled: false, message: '手機版不使用鍵盤快捷鍵。' }),
    onSchedulesChanged: (callback) => changedListeners.push(callback),
    onFocusStatusChanged: (callback) => statusListeners.push(callback),
    onSettingsChanged: () => {},
    onAppMessage: (callback) => { messageListeners.push(callback); if (dataWarning) callback(dataWarning); }
  };

  function checkSchedules() {
    if (starting || document.visibilityState === 'hidden') return;
    const now = new Date();
    const schedules = readSchedules();
    const due = schedules.find((schedule) => {
      const occurrence = logic.dueOccurrence(schedule, now);
      return occurrence && !launched.has(occurrence.key);
    });
    if (!due) return;
    const occurrence = logic.dueOccurrence(due, now);
    const result = beginFocus(due, false, occurrence);
    if (!result.ok) { warn(result.message); return; }
    due.lastRunDate = occurrence.runDate;
    try { writeSchedules(schedules); }
    catch {
      const warning = '本次專注已啟動，但排程紀錄無法保存；此分頁不會重複啟動，關閉瀏覽器後請檢查儲存空間。';
      warn(warning);
      try {
        const snapshot = JSON.parse(sessionStorage.getItem('focus-clock-current'));
        snapshot.warning = warning;
        sessionStorage.setItem('focus-clock-current', JSON.stringify(snapshot));
      } catch {}
    }
    changedListeners.forEach((callback) => callback());
    try { if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('專注時間到了', {
        body: `${due.title}，開始專注 ${due.duration} 分鐘。`,
        icon: 'pwa-icon-192.png'
      });
    } } catch { /* 通知不支援不能中止已建立的倒數。 */ }
  }

  window.addEventListener('storage', (event) => {
    if (event.key && event.key !== schedulesKey) return;
    cachedSchedules = null;
    corruptNotPreserved = false;
    changedListeners.forEach((callback) => callback());
  });
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event;
    const button = document.querySelector('#install-app-button');
    if (button) {
      button.textContent = '安裝 App';
      button.dataset.installReady = 'true';
    }
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    const button = document.querySelector('#install-app-button');
    if (!button) return;
    button.dataset.installReady = 'false';
    button.textContent = '安裝完成';
    button.disabled = true;
    showInstallHelp('安裝完成，現在可以從主畫面或桌面圖示開啟番茄鐘。');
  });
  window.addEventListener('DOMContentLoaded', () => {
    const installButton = document.querySelector('#install-app-button');
    if (isNativeAndroid) {
      installButton.textContent = '已安裝';
      installButton.disabled = true;
      document.querySelector('#platform-note').textContent = 'Android 前景版：必須保持 App 開啟。切到背景、熄屏、關閉或被系統回收時，不保證準時啟動。';
      document.querySelector('#platform-safety').textContent = 'Android App 不會阻止切換其他 App；專注畫面提供直接結束按鈕。';
    } else {
      document.querySelector('#web-app-note').hidden = false;
      installButton.addEventListener('click', installApp);
      if (isStandalone()) {
        installButton.textContent = '已安裝';
        installButton.disabled = true;
      }
      document.querySelector('#platform-note').textContent = '網頁前景版：必須保持頁面開啟。背景凍結、熄屏或關閉瀏覽器時，不保證準時啟動。';
      document.querySelector('#platform-safety').textContent = '手機版不會阻止切換其他 App；專注畫面提供直接結束按鈕。';
    }
    document.querySelectorAll('.desktop-only').forEach((element) => { element.hidden = true; });
    warn(dataWarning);
    const result = new URLSearchParams(location.search).get('focus');
    if (result) {
      setTimeout(() => statusListeners.forEach((callback) => callback({ reason: result })), 0);
      history.replaceState({}, '', 'index.html');
    }
  });

  document.addEventListener('visibilitychange', () => {
    const state = document.querySelector('#running-state');
    if (state) state.textContent = document.visibilityState === 'visible' ? '前景排程檢查中；錯過後依排程設定最多補跑 5 分鐘。' : '頁面在背景，排程可能暫停。';
    if (document.visibilityState === 'visible') checkSchedules();
  });

  if (!isNativeAndroid && 'serviceWorker' in navigator && (
    location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname)
  )) {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  }

  setInterval(checkSchedules, 1000);
  checkSchedules();
})();
