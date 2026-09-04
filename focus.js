let session;
let timerId;
let holdTimer;
let holdStartedAt;
let frameTimer;
let wakeLock = null;
let wakePending = false;
let restShown = false;
let webFocusEnded = false;
let previousFocus;
const isWebApp = !window.focusSession;
const $ = (selector) => document.querySelector(selector);

function readWebSession() {
  try {
    const saved = JSON.parse(sessionStorage.getItem('focus-clock-current') || 'null');
    if (!saved || !Number.isFinite(saved.startedAt) || !Number.isFinite(saved.endsAt) ||
      saved.endsAt <= saved.startedAt || saved.endsAt - saved.startedAt > 720 * 60000 ||
      (saved.url && !window.focusClockLogic.normalizeUrl(saved.url))) return null;
    return { ...saved, ...window.focusClockLogic.cleanSchedule(saved) };
  } catch { return null; }
}

function endWebFocus(reason = 'ended') {
  if (webFocusEnded) return;
  webFocusEnded = true;
  try { sessionStorage.removeItem('focus-clock-current'); } catch {}
  cleanup();
  location.replace('index.html?focus=' + (reason === 'completed' ? 'completed' : 'ended'));
}

const focusApi = window.focusSession || {
  getCurrent: async () => readWebSession(),
  emergencyUnlock: async () => endWebFocus('ended'),
  onNotice: () => {}, onLoadFailed: () => {}
};

function formatRemaining(milliseconds) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  const parts = [minutes, rest];
  if (hours) parts.unshift(hours);
  return parts.map((value) => String(value).padStart(2, '0')).join(':');
}

function tick() {
  if (!session) return;
  const remaining = session.endsAt - Date.now();
  $('#countdown').textContent = formatRemaining(remaining);
  if (session.duration > 60 && !restShown && Date.now() - session.startedAt >= 60 * 60000) {
    restShown = true;
    $('#rest-reminder').hidden = false;
  }
  if (remaining <= 0) {
    clearInterval(timerId);
    if (isWebApp) endWebFocus('completed');
  }
}

function showUnlock() {
  previousFocus = document.activeElement;
  cancelEmergencyHold();
  $('#unlock-confirm').hidden = false;
  $('.focus-shell').inert = true;
  $('#direct-exit-button').inert = true;
  $('#cancel-unlock').focus();
}
function hideUnlock() {
  $('#unlock-confirm').hidden = true;
  $('.focus-shell').inert = false;
  $('#direct-exit-button').inert = false;
  previousFocus?.focus();
}

function startEmergencyHold() {
  if (holdTimer || !session || document.visibilityState === 'hidden') return;
  holdStartedAt = Date.now();
  holdTimer = setInterval(() => {
    const progress = Math.min(100, ((Date.now() - holdStartedAt) / 5000) * 100);
    $('#hold-progress').style.width = progress + '%';
    if (progress >= 100) {
      cancelEmergencyHold();
      if (session.preview) focusApi.emergencyUnlock();
      else showUnlock();
    }
  }, 40);
}
function cancelEmergencyHold() {
  clearInterval(holdTimer); holdTimer = null;
  $('#hold-progress').style.width = '0';
}

async function releaseWakeLock() {
  const lock = wakeLock; wakeLock = null;
  if (lock) await lock.release().catch(() => {});
}
async function keepScreenAwake() {
  if (!isWebApp || !session || webFocusEnded || document.visibilityState !== 'visible' ||
    !('wakeLock' in navigator) || wakeLock || wakePending) return;
  wakePending = true;
  try {
    const lock = await navigator.wakeLock.request('screen');
    if (webFocusEnded || document.visibilityState !== 'visible') { await lock.release(); return; }
    wakeLock = lock;
    lock.addEventListener('release', () => { if (wakeLock === lock) wakeLock = null; });
  } catch { /* 不支援或省電限制時仍保留倒數與手動退出。 */ }
  finally { wakePending = false; }
}
function cleanup() {
  cancelEmergencyHold(); clearInterval(timerId); clearTimeout(frameTimer); releaseWakeLock();
}
function showNotice(message) {
  $('#focus-notice-message').textContent = message;
  $('#focus-notice').hidden = false;
}
function useLockScreen() {
  clearTimeout(frameTimer);
  $('#focus-frame').removeAttribute('src');
  $('#web-area').hidden = true;
  $('#lock-screen').hidden = false;
  $('#direct-exit-button').focus();
}

async function initialize() {
  session = await focusApi.getCurrent();
  if (!session || session.ok === false) {
    if (isWebApp) location.replace('index.html');
    return;
  }
  if (isWebApp) {
    document.documentElement.dataset.platform = 'web';
    $('#emergency-button').hidden = true;
    $('#direct-exit-button').hidden = false;
    $('#mode-label').textContent = session.preview ? '前景安全測試' : '前景專注進行中';
    $('#unlock-confirm span').textContent = '結束專注';
    $('#unlock-title').textContent = '確定要直接結束嗎？';
    $('#unlock-description').textContent = '倒數還沒結束，確認後會立即回到排程畫面。';
    $('#confirm-unlock').textContent = '直接結束';
    keepScreenAwake();
  } else {
    $('#mode-label').textContent = session.preview ? '安全測試模式' : '專注進行中';
    $('#exit-hint').textContent = session.preview ? 'Shift+S、右鍵或按住五秒退出' : '按住滑鼠／Enter／空白鍵五秒解鎖';
  }
  $('#session-title').textContent = session.title;
  if (session.warning) showNotice(session.warning);
  if (session.url) {
    $('#web-area').hidden = false;
    if (isWebApp) {
      $('#focus-webview').hidden = true;
      $('#focus-frame').hidden = false;
      $('#web-help').hidden = false;
      $('#open-focus-site').href = session.url;
      $('#focus-frame').src = session.url;
      // 跨網域 iframe 無法可靠回報 CSP/X-Frame-Options；永遠保留可操作的備案。
      frameTimer = setTimeout(() => {
        $('#web-help-message').textContent = '若網站仍是空白，可能禁止嵌入或網路中斷。瀏覽器無法確認網站內容，請使用下方備案；倒數仍繼續。';
      }, 10000);
      $('#focus-frame').addEventListener('error', () => {
        $('#web-help-message').textContent = '網站無法載入，請改用內建畫面或在瀏覽器開啟。';
      });
    } else $('#focus-webview').src = session.url;
  } else $('#lock-screen').hidden = false;
  timerId = setInterval(tick, 250); tick();
}

const emergencyButton = $('#emergency-button');
emergencyButton.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  emergencyButton.setPointerCapture(event.pointerId); startEmergencyHold();
});
['pointerup', 'pointercancel', 'pointerleave', 'lostpointercapture', 'blur'].forEach((name) => emergencyButton.addEventListener(name, cancelEmergencyHold));
emergencyButton.addEventListener('keydown', (event) => {
  if (['Enter', ' '].includes(event.key)) { event.preventDefault(); if (!event.repeat) startEmergencyHold(); }
});
emergencyButton.addEventListener('keyup', cancelEmergencyHold);
window.addEventListener('blur', cancelEmergencyHold);
window.addEventListener('pagehide', cleanup);
window.addEventListener('pageshow', (event) => {
  if (!event.persisted || !isWebApp) return;
  session = readWebSession();
  if (!session) { endWebFocus('ended'); return; }
  webFocusEnded = false;
  clearInterval(timerId);
  timerId = setInterval(tick, 250);
  tick(); keepScreenAwake();
});
document.addEventListener('visibilitychange', () => {
  cancelEmergencyHold();
  if (document.visibilityState === 'visible') { tick(); keepScreenAwake(); }
  else releaseWakeLock();
});
$('#continue-button').addEventListener('click', () => { $('#rest-reminder').hidden = true; });
$('#close-notice').addEventListener('click', () => { $('#focus-notice').hidden = true; });
$('#cancel-unlock').addEventListener('click', hideUnlock);
$('#confirm-unlock').addEventListener('click', () => focusApi.emergencyUnlock());
$('#direct-exit-button').addEventListener('click', showUnlock);
$('#use-lock-screen').addEventListener('click', useLockScreen);
$('#unlock-confirm').addEventListener('keydown', (event) => {
  if (event.key === 'Escape') { event.preventDefault(); hideUnlock(); }
  if (event.key === 'Tab') {
    event.preventDefault();
    (document.activeElement === $('#cancel-unlock') ? $('#confirm-unlock') : $('#cancel-unlock')).focus();
  }
});
focusApi.onNotice((detail) => showNotice(detail.message));
focusApi.onLoadFailed((detail) => {
  $('#web-area').hidden = true; $('#load-error').hidden = false;
  $('#load-error-message').textContent = detail.message + ' 倒數仍會繼續，時間到會自動解除。';
});
initialize();
