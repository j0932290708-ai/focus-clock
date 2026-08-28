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
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
  document.querySelector('#form-title').textContent = '新增自律時鐘';
  warning.hidden = true;
}

async function loadSchedules() {
  schedules = await window.focusClock.getSchedules();
  renderSchedules();
}

function shortcutLabel(value) {
  return value.replace('CommandOrControl', 'Ctrl').replaceAll('+', ' + ');
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
          <input class="card-toggle" type="checkbox" ${schedule.enabled ? 'checked' : ''}>
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
  let url = urlText;

  if (urlText && !/^https?:\/\//i.test(urlText)) url = `https://${urlText}`;
  if (url) {
    try {
      const checked = new URL(url);
      if (!['http:', 'https:'].includes(checked.protocol)) throw new Error();
      url = checked.toString();
    } catch {
      showMessage('網址格式不正確，請重新檢查。');
      return;
    }
  }

  const schedule = {
    id,
    title: document.querySelector('#title').value,
    time: selectedTime(),
    duration: Number(durationInput.value),
    url,
    enabled: document.querySelector('#enabled').checked,
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
  showMessage(url.startsWith('http://')
    ? '已儲存；提醒：HTTP 網址未加密，建議改用 HTTPS。'
    : '已儲存，每天會在設定時間啟動。');
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
    document.querySelector('#form-title').textContent = '編輯自律時鐘';
    warning.hidden = schedule.duration <= 60;
    document.querySelector('.form-panel').scrollIntoView({ behavior: 'smooth' });
  }

  if (button.dataset.action === 'delete') {
    if (!confirm(`確定要刪除「${schedule.title}」嗎？`)) return;
    const wasEditing = document.querySelector('#schedule-id').value === schedule.id;
    const nextSchedules = schedules.filter((item) => item.id !== schedule.id);
    const result = await window.focusClock.saveSchedules(nextSchedules);
    if (!result.ok) {
      showMessage(result.message || '刪除失敗，原本的排程仍然保留。');
      return;
    }
    schedules = result.schedules;
    renderSchedules();
    if (wasEditing) resetForm();
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
window.focusClock.onAppMessage(showMessage);
setInterval(updateClock, 1000);
fillTimeChoices();
setSelectedTime('08:30');
updateClock();
loadSchedules();
loadSettings();
