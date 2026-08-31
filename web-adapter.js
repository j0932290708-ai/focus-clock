(() => {
  if (window.focusClock) return;

  const logic = window.focusClockLogic;
  const schedulesKey = 'focus-clock-schedules';
  const changedListeners = [];
  const statusListeners = [];
  document.documentElement.dataset.platform = 'web';

  function readSchedules() {
    try {
      const saved = JSON.parse(localStorage.getItem(schedulesKey) || '[]');
      return Array.isArray(saved) ? saved.map(logic.cleanSchedule) : [];
    } catch {
      return [];
    }
  }

  function writeSchedules(schedules) {
    localStorage.setItem(schedulesKey, JSON.stringify(schedules));
  }

  function beginFocus(schedule, preview) {
    const cleaned = logic.cleanSchedule(schedule);
    const startedAt = Date.now();
    sessionStorage.setItem('focus-clock-current', JSON.stringify({
      ...cleaned,
      preview,
      startedAt,
      endsAt: startedAt + cleaned.duration * 60 * 1000
    }));
    setTimeout(() => location.assign('focus.html?web=1'), 0);
    return { ok: true };
  }

  window.focusClock = {
    getSchedules: async () => readSchedules(),
    saveSchedules: async (rawSchedules) => {
      const schedules = Array.isArray(rawSchedules) ? rawSchedules.map(logic.cleanSchedule) : [];
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
        return { ok: false, schedules: readSchedules(), message: '手機無法儲存排程，請檢查瀏覽器儲存空間。' };
      }
      return { ok: true, schedules };
    },
    startFocus: async (schedule) => beginFocus(schedule, true),
    getSettings: async () => ({ shortcut: 'CommandOrControl+Alt+P', shortcutEnabled: false, message: '' }),
    setShortcut: async () => ({ ok: false, shortcut: '', shortcutEnabled: false, message: '手機版不使用鍵盤快捷鍵。' }),
    onSchedulesChanged: (callback) => changedListeners.push(callback),
    onFocusStatusChanged: (callback) => statusListeners.push(callback),
    onSettingsChanged: () => {},
    onAppMessage: () => {}
  };

  function checkSchedules() {
    const now = new Date();
    const schedules = readSchedules();
    const due = schedules.find((schedule) => logic.shouldStart(schedule, now));
    if (!due) return;
    due.lastRunDate = logic.localDateKey(now);
    writeSchedules(schedules);
    changedListeners.forEach((callback) => callback());
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('專注時間到了', {
        body: `${due.title}，開始專注 ${due.duration} 分鐘。`,
        icon: 'pwa-icon-192.png'
      });
    }
    beginFocus(due, false);
  }

  window.addEventListener('storage', () => changedListeners.forEach((callback) => callback()));
  window.addEventListener('DOMContentLoaded', () => {
    document.querySelector('#web-app-note').hidden = false;
    document.querySelector('#platform-note').textContent = '手機版需保持網頁開啟，時間到才會自動進入專注畫面。';
    document.querySelector('#platform-safety').textContent = '手機版不會阻止切換其他 App；專注畫面提供直接結束按鈕。';
    const result = new URLSearchParams(location.search).get('focus');
    if (result) {
      setTimeout(() => statusListeners.forEach((callback) => callback({ reason: result })), 0);
      history.replaceState({}, '', 'index.html');
    }
  });

  if ('serviceWorker' in navigator && (
    location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname)
  )) {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  }

  setInterval(checkSchedules, 1000);
  checkSchedules();
})();
