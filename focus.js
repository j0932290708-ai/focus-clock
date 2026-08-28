let session;
let timerId;
let holdTimer;
let holdStartedAt;
let restShown = false;

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

  if (remaining <= 0) clearInterval(timerId);
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
      if (session.preview) await window.focusSession.emergencyUnlock();
      else document.querySelector('#unlock-confirm').hidden = false;
    }
  }, 40);
}

function cancelEmergencyHold() {
  clearInterval(holdTimer);
  document.querySelector('#hold-progress').style.width = '0';
}

async function initialize() {
  session = await window.focusSession.getCurrent();
  if (!session) return;

  document.querySelector('#session-title').textContent = session.title;
  if (session.preview) {
    document.querySelector('#mode-label').textContent = '安全測試模式';
    document.querySelector('#exit-hint').textContent = 'Shift + S、右鍵或長按退出';
  } else {
    document.querySelector('#exit-hint').textContent = '長按 5 秒申請緊急解鎖';
  }
  if (session.url) {
    document.querySelector('#web-area').hidden = false;
    document.querySelector('#focus-webview').src = session.url;
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
  await window.focusSession.emergencyUnlock();
});

window.focusSession.onNotice((detail) => {
  document.querySelector('#focus-notice-message').textContent = detail.message;
  document.querySelector('#focus-notice').hidden = false;
});

window.focusSession.onLoadFailed((detail) => {
  document.querySelector('#web-area').hidden = true;
  document.querySelector('#load-error').hidden = false;
  document.querySelector('#load-error-message').textContent = `${detail.message} 倒數仍會繼續，時間到會自動解除。`;
});

initialize();
