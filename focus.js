let session;
let timerId;
let holdTimer;
let holdStartedAt;
let restShown = false;
let webFocusEnded = false;
const isWebApp = !window.focusSession;

function readWebSession() {
  try {
    return JSON.parse(sessionStorage.getItem('focus-clock-current') || 'null');
  } catch {
    return null;
  }
}

function endWebFocus(reason = 'ended') {
  if (webFocusEnded) return;
  webFocusEnded = true;
  sessionStorage.removeItem('focus-clock-current');
  const result = reason === 'completed' ? 'completed' : 'ended';
  location.replace(`index.html?focus=${result}`);
}

const focusApi = window.focusSession || {
  getCurrent: async () => readWebSession(),
  emergencyUnlock: async () => endWebFocus('ended'),
  onNotice: () => {},
  onLoadFailed: () => {}
};

function formatRemaining(milliseconds) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  if (hours > 0) return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

function tick() {
  const remaining = session.endsAt - Date.now();
  document.querySelector('#countdown').textContent = formatRemaining(remaining);

  if (session.duration > 60 && !restShown && Date.now() - session.startedAt >= 60 * 60 * 1000) {
    restShown = true;
    document.querySelector('#rest-reminder').hidden = false;
  }

  if (remaining <= 0) {
    clearInterval(timerId);
    if (isWebApp) endWebFocus('completed');
  }
}

function startEmergencyHold() {
  holdStartedAt = Date.now();
  clearInterval(holdTimer);
  holdTimer = setInterval(async () => {
    const progress = Math.min(100, ((Date.now() - holdStartedAt) / 5000) * 100);
    document.querySelector('#hold-progress').style.width = `${progress}%`;
    if (progress >= 100) {
      clearInterval(holdTimer);
      document.querySelector('#hold-progress').style.width = '0';
      if (session.preview) await focusApi.emergencyUnlock();
      else document.querySelector('#unlock-confirm').hidden = false;
    }
  }, 40);
}

function cancelEmergencyHold() {
  clearInterval(holdTimer);
  document.querySelector('#hold-progress').style.width = '0';
}

async function keepScreenAwake() {
  if (!isWebApp || !('wakeLock' in navigator)) return;
  try {
    await navigator.wakeLock.request('screen');
  } catch {}
}

async function initialize() {
  session = await focusApi.getCurrent();
  if (!session) {
    if (isWebApp) location.replace('index.html');
    return;
  }

  if (isWebApp) {
    document.documentElement.dataset.platform = 'web';
    document.querySelector('#emergency-button').hidden = true;
    document.querySelector('#direct-exit-button').hidden = false;
    document.querySelector('#mode-label').textContent = session.preview ? '手機安全測試' : '手機專注進行中';
    document.querySelector('#exit-hint').textContent = '手機／平板專注模式';
    document.querySelector('#unlock-confirm span').textContent = '結束專注';
    document.querySelector('#unlock-confirm h2').textContent = '確定要直接結束嗎？';
    document.querySelector('#unlock-confirm p').textContent = '倒數還沒結束，確認後會立即回到排程畫面。';
    document.querySelector('#confirm-unlock').textContent = '直接結束';
    keepScreenAwake();
  }

  document.querySelector('#session-title').textContent = session.title;
  if (!isWebApp && session.preview) {
    document.querySelector('#mode-label').textContent = '安全測試模式';
    document.querySelector('#exit-hint').textContent = 'Shift + S、右鍵或長按退出';
  } else if (!isWebApp) {
    document.querySelector('#exit-hint').textContent = '長按 5 秒申請緊急解鎖';
  }

  if (session.url) {
    document.querySelector('#web-area').hidden = false;
    if (isWebApp) {
      document.querySelector('#focus-webview').hidden = true;
      document.querySelector('#focus-frame').hidden = false;
      document.querySelector('#focus-frame').src = session.url;
    } else {
      document.querySelector('#focus-webview').src = session.url;
    }
  } else {
    document.querySelector('#lock-screen').hidden = false;
  }

  timerId = setInterval(tick, 250);
  tick();
}

const emergencyButton = document.querySelector('#emergency-button');
emergencyButton.addEventListener('mousedown', startEmergencyHold);
emergencyButton.addEventListener('mouseup', cancelEmergencyHold);
emergencyButton.addEventListener('mouseleave', cancelEmergencyHold);
emergencyButton.addEventListener('touchstart', (event) => {
  event.preventDefault();
  startEmergencyHold();
}, { passive: false });
emergencyButton.addEventListener('touchend', cancelEmergencyHold);

document.querySelector('#continue-button').addEventListener('click', () => {
  document.querySelector('#rest-reminder').hidden = true;
});

document.querySelector('#close-notice').addEventListener('click', () => {
  document.querySelector('#focus-notice').hidden = true;
});

document.querySelector('#cancel-unlock').addEventListener('click', () => {
  document.querySelector('#unlock-confirm').hidden = true;
});

document.querySelector('#confirm-unlock').addEventListener('click', async () => {
  await focusApi.emergencyUnlock();
});

document.querySelector('#direct-exit-button').addEventListener('click', () => {
  document.querySelector('#unlock-confirm').hidden = false;
});

focusApi.onNotice((detail) => {
  document.querySelector('#focus-notice-message').textContent = detail.message;
  document.querySelector('#focus-notice').hidden = false;
});

focusApi.onLoadFailed((detail) => {
  document.querySelector('#web-area').hidden = true;
  document.querySelector('#load-error').hidden = false;
  document.querySelector('#load-error-message').textContent = `${detail.message} 倒數仍會繼續，時間到會自動解除。`;
});

initialize();
