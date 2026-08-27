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

async function tick() {
  const remaining = session.endsAt - Date.now();
  document.querySelector('#countdown').textContent = formatRemaining(remaining);

  if (session.duration > 60 && !restShown && Date.now() - session.startedAt >= 60 * 60 * 1000) {
    restShown = true;
    document.querySelector('#rest-reminder').hidden = false;
  }

  if (remaining <= 0) {
    clearInterval(timerId);
    await window.focusSession.complete();
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
      await window.focusSession.emergencyUnlock();
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
    document.querySelector('#exit-hint').textContent = 'Shift + S、右鍵或長按退出';
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

initialize();
