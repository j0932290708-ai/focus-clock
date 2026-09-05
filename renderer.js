const form = document.querySelector('#schedule-form');
const list = document.querySelector('#schedule-list');
const durationInput = document.querySelector('#duration');
const warning = document.querySelector('#overwork-warning');
const message = document.querySelector('#form-message');
let schedules = [];

function fillTimeChoices() {
  const hour = document.querySelector('#start-hour');
  const minute = document.querySelector('#start-minute');
  hour.innerHTML = Array.from({ length: 24 }, (_, number) => {
    const value = String(number).padStart(2, '0');
    return `<option value="${value}">${value} 時</option>`;
  }).join('');
  minute.innerHTML = Array.from({ length: 60 }, (_, number) => {
    const value = String(number).padStart(2, '0');
    return `<option value="${value}">${value} 分</option>`;
  }).join('');
}

function selectedTime() {
  return `${document.querySelector('#start-hour').value}:${document.querySelector('#start-minute').value}`;
}

function setSelectedTime(time = '08:30') {
  const [hour = '08', minute = '30'] = time.split(':');
  document.querySelector('#start-hour').value = hour;
  document.querySelector('#start-minute').value = minute;
}

function makeId() {
  return window.focusClockLogic.makeScheduleId();
}

function showMessage(text) {
  message.textContent = text;
  setTimeout(() => {
    if (message.textContent === text) message.textContent = '';
  }, 2500);
}

function resetForm() {
  form.reset();
  document.querySelector('#schedule-id').value = '';
  document.querySelector('#title').value = '讀書';
  setSelectedTime('08:30');
  document.querySelector('#duration').value = '45';
  document.querySelector('#enabled').checked = true;
  document.querySelector('#catch-up').value = 'yes';
  document.querySelector('#form-title').textContent = '新增自律時鐘';
  warning.hidden = true;
}

async function loadSchedules() {
  schedules = await window.focusClock.getSchedules();
  renderSchedules();
}

function shortcutLabel(value) {
  return value.replace('CommandOrControl', 'Ctrl').replace(/\+/g, ' + ');
}

async function loadSettings() {
  const settings = await window.focusClock.getSettings();
  renderShortcutSettings(settings);
}

function renderShortcutSettings(settings) {
  document.querySelector('#shortcut-select').value = settings.shortcut;
  document.querySelector('#active-shortcut').textContent = settings.shortcutEnabled
    ? shortcutLabel(settings.shortcut)
    : '未啟用';
  if (settings.message) showMessage(settings.message);
}

function escapeText(text) {
  const node = document.createElement('span');
  node.textContent = text;
  return node.innerHTML;
}

function renderSchedules() {
  list.innerHTML = '';
  document.querySelector('#schedule-count').textContent = `${schedules.length} 個`;

  if (schedules.length === 0) {
    list.append(document.querySelector('#empty-template').content.cloneNode(true));
    return;
  }

  const ordered = [...schedules].sort((a, b) => a.time.localeCompare(b.time));
  ordered.forEach((schedule) => {
    const card = document.createElement('div');
    card.className = `schedule-card${schedule.enabled ? '' : ' off'}`;
    card.dataset.id = schedule.id;
    const target = schedule.url ? schedule.url.replace(/^https?:\/\//, '') : '鎖定畫面';
    card.innerHTML = `
      <div>
        <div class="schedule-time">${escapeText(schedule.time)}</div>
        <label class="switch mini-switch" title="啟用或停用">
          <input class="card-toggle" type="checkbox" aria-label="啟用或停用 ${escapeText(schedule.title).replace(/"/g, '&quot;')}" ${schedule.enabled ? 'checked' : ''}>
          <span></span>
        </label>
      </div>
      <div class="schedule-info">
        <h4>${escapeText(schedule.title)}</h4>
        <p>${schedule.duration} 分鐘 · ${escapeText(target)}</p>
      </div>
      <div class="schedule-actions">
        <button class="icon-button start" data-action="start" type="button">安全測試</button>
        <button class="icon-button" data-action="edit" type="button">編輯</button>
        <button class="icon-button danger" data-action="delete" type="button">刪除</button>
      </div>`;
    list.append(card);
  });
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const id = document.querySelector('#schedule-id').value || makeId();
  const urlText = document.querySelector('#focus-url').value.trim();
  const url = window.focusClockLogic.normalizeUrl(urlText);
  if (urlText && !url) { showMessage('專注網址只接受 HTTPS，不能包含帳號或密碼。'); return; }

  const schedule = {
    id,
    title: document.querySelector('#title').value,
    time: selectedTime(),
    duration: Number(durationInput.value),
    url,
    enabled: document.querySelector('#enabled').checked,
    catchUp: document.querySelector('#catch-up').value === 'yes',
    lastRunDate: (() => {
      const previous = schedules.find((item) => item.id === id);
      return previous && previous.time === selectedTime() ? previous.lastRunDate : '';
    })()
  };

  const index = schedules.findIndex((item) => item.id === id);
  const nextSchedules = [...schedules];
  if (index >= 0) nextSchedules[index] = schedule;
  else nextSchedules.push(schedule);

  const result = await window.focusClock.saveSchedules(nextSchedules);
  if (!result.ok) {
    showMessage(result.message);
    return;
  }
  schedules = result.schedules;
  renderSchedules();
  resetForm();
  showMessage('已儲存；請保持程式執行，並留意上方的平台限制。');
});

list.addEventListener('click', async (event) => {
  const card = event.target.closest('.schedule-card');
  const button = event.target.closest('button');
  if (!card || !button) return;

  const schedule = schedules.find((item) => item.id === card.dataset.id);
  if (!schedule) return;

  if (button.dataset.action === 'start') {
    const result = await window.focusClock.startFocus(schedule);
    if (!result.ok) showMessage(result.message);
  }

  if (button.dataset.action === 'edit') {
    document.querySelector('#schedule-id').value = schedule.id;
    document.querySelector('#title').value = schedule.title;
    setSelectedTime(schedule.time);
    durationInput.value = schedule.duration;
    document.querySelector('#focus-url').value = schedule.url;
    document.querySelector('#enabled').checked = schedule.enabled;
    document.querySelector('#catch-up').value = schedule.catchUp === false ? 'no' : 'yes';
    document.querySelector('#form-title').textContent = '編輯自律時鐘';
    warning.hidden = schedule.duration <= 60;
    document.querySelector('.form-panel').scrollIntoView({ behavior: 'smooth' });
  }

  if (button.dataset.action === 'delete') {
    if (!await confirmAction(`確定要刪除「${schedule.title}」嗎？此操作不能復原，建議先匯出備份。`)) return;
    const wasEditing = document.querySelector('#schedule-id').value === schedule.id;
    const nextSchedules = schedules.filter((item) => item.id !== schedule.id);
    const result = await window.focusClock.saveSchedules(nextSchedules);
    if (!result.ok) {
      showMessage(result.message || '刪除失敗，原本的排程仍然保留。');
      return;
    }
    schedules = result.schedules;
    renderSchedules();
    // 刪除目前正在編輯的排程時，只退出編輯狀態，保留使用者剛選的時間與表單內容。
    // 這也避免非同步儲存完成後才 resetForm，覆蓋使用者在確認刪除後立刻做的新選擇。
    if (wasEditing) {
      document.querySelector('#schedule-id').value = '';
      document.querySelector('#form-title').textContent = '新增自律時鐘';
    }
    document.querySelector('#title').focus();
    showMessage('排程已刪除，可以繼續新增或修改時間。');
  }
});

list.addEventListener('change', async (event) => {
  if (!event.target.classList.contains('card-toggle')) return;
  const card = event.target.closest('.schedule-card');
  const schedule = schedules.find((item) => item.id === card.dataset.id);
  const previousEnabled = schedule.enabled;
  schedule.enabled = event.target.checked;
  const result = await window.focusClock.saveSchedules(schedules);
  if (!result.ok) {
    schedule.enabled = previousEnabled;
    showMessage(result.message);
  }
  schedules = result.schedules;
  renderSchedules();
  list.querySelectorAll('.schedule-card').forEach((element) => {
    if (element.dataset.id === schedule.id) element.querySelector('.card-toggle').focus();
  });
});

function confirmAction(text) {
  const dialog = document.querySelector('#action-confirm');
  if (dialog.open) return Promise.resolve(false);
  document.querySelector('#action-confirm-message').textContent = text;
  dialog.returnValue = 'cancel';
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true });
    dialog.showModal();
  });
}

let backupObjectUrl;
document.querySelector('#export-schedules').addEventListener('click', () => {
  const data = window.focusClockLogic.scheduleDocument(schedules);
  const text = JSON.stringify(data, null, 2);
  if (backupObjectUrl) URL.revokeObjectURL(backupObjectUrl);
  backupObjectUrl = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  document.querySelector('#backup-text').value = text;
  document.querySelector('#backup-download').href = backupObjectUrl;
  document.querySelector('#export-dialog').showModal();
});
document.querySelector('#export-dialog').addEventListener('close', () => {
  if (backupObjectUrl) URL.revokeObjectURL(backupObjectUrl);
  backupObjectUrl = null;
  document.querySelector('#backup-download').removeAttribute('href');
  document.querySelector('#backup-text').value = '';
});
document.querySelector('#import-schedules').addEventListener('click', () => document.querySelector('#import-file').click());
document.querySelector('#import-file').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  try {
    if (file.size > 1024 * 1024) throw new Error('備份檔不得超過 1 MB。');
    const decoded = window.focusClockLogic.decodeSchedules(JSON.parse(await file.text()));
    if (!await confirmAction(`將以 ${decoded.schedules.length} 個排程取代目前排程。${decoded.message} 建議先匯出原本備份。確定匯入？`)) return;
    const result = await window.focusClock.saveSchedules(decoded.schedules);
    if (!result.ok) throw new Error(result.message);
    schedules = result.schedules;
    renderSchedules(); resetForm();
    showMessage(`已匯入。${decoded.message}`);
  } catch (error) { showMessage(`匯入失敗：${error.message}`); }
});

durationInput.addEventListener('input', () => {
  warning.hidden = Number(durationInput.value) <= 60;
});

document.querySelector('#reset-button').addEventListener('click', resetForm);
document.querySelector('#save-shortcut').addEventListener('click', async () => {
  const result = await window.focusClock.setShortcut(document.querySelector('#shortcut-select').value);
  renderShortcutSettings(result);
  showMessage(result.ok ? '快捷鍵已更新。' : result.message);
});

function updateClock() {
  document.querySelector('#live-clock').textContent = new Date().toLocaleTimeString('zh-TW', {
    hour: '2-digit', minute: '2-digit', hour12: false
  });
}

window.focusClock.onSchedulesChanged(loadSchedules);
window.focusClock.onFocusStatusChanged((detail) => {
  showMessage(detail?.shouldRest ? '專注完成！請喝水、活動身體並讓眼睛休息。' : '專注時間已結束。');
});
window.focusClock.onSettingsChanged((settings) => {
  renderShortcutSettings(settings);
});
window.focusClock.onAppMessage((text) => {
  showMessage(text);
  const element = document.querySelector('#data-warning');
  element.textContent = text; element.hidden = !text;
});
setInterval(updateClock, 1000);
fillTimeChoices();
setSelectedTime('08:30');
updateClock();
loadSchedules();
loadSettings();
