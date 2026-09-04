// 這個檔案只放不需要畫面的共用規則，方便測試與閱讀。

function normalizeUrl(input) {
  const text = String(input || '').trim();
  if (!text) return '';

  if (text.length > 2048) return '';
  const withProtocol = /^[a-z][a-z\d+.-]*:/i.test(text) ? text : `https://${text}`;

  try {
    const url = new URL(withProtocol);
    return url.protocol === 'https:' && url.hostname && !url.username && !url.password ? url.toString() : '';
  } catch {
    return '';
  }
}

function isValidTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ''));
}

function cleanSchedule(schedule) {
  const source = schedule && typeof schedule === 'object' ? schedule : {};
  const rawDuration = Number(source.duration);
  const duration = Number.isFinite(rawDuration)
    ? Math.max(1, Math.min(720, Math.trunc(rawDuration)))
    : 45;

  return {
    id: String(source.id || makeScheduleId()).slice(0, 100),
    title: String(source.title || '讀書').trim().slice(0, 30) || '讀書',
    time: isValidTime(source.time) ? source.time : '08:30',
    duration,
    url: normalizeUrl(source.url),
    enabled: source.enabled !== false,
    catchUp: source.catchUp !== false,
    lastRunDate: /^\d{4}-\d{2}-\d{2}$/.test(source.lastRunDate) ? source.lastRunDate : ''
  };
}

const SCHEMA_VERSION = 1;
const MAX_SCHEDULES = 200;
function makeScheduleId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// 舊版陣列也可讀取；修復 ID 使用固定索引，儲存失敗時重讀不會一直換 ID。
function decodeSchedules(saved) {
  const rows = Array.isArray(saved) ? saved : saved?.schemaVersion === SCHEMA_VERSION ? saved.schedules : null;
  if (!Array.isArray(rows) || rows.length > MAX_SCHEDULES) throw new Error('排程資料格式或版本不支援。');
  const seen = new Set();
  const notices = [];
  const schedules = rows.map((row, index) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('排程資料損壞。');
    const item = cleanSchedule(row);
    if (!row.id || seen.has(item.id)) {
      let suffix = index;
      do { item.id = `recovered-${index}-${suffix++}`; }
      while (seen.has(item.id) || rows.some((other) => other?.id === item.id));
      notices.push('已修復缺少或重複的排程 ID。');
    }
    seen.add(item.id);
    if (!isValidTime(row.time) || (row.url && !normalizeUrl(row.url))) {
      item.enabled = false;
      notices.push('無效時間或非 HTTPS 網址的舊排程已停用，請重新設定。');
    }
    return item;
  });
  // 損壞／舊資料中的衝突保留，但停用後面的項目，避免同時啟動。
  schedules.forEach((item, index) => {
    if (schedules.slice(0, index).some((previous) => schedulesOverlap(previous, item))) {
      item.enabled = false;
      notices.push('重疊的舊排程已停用，請調整時間。');
    }
  });
  return { schedules, message: [...new Set(notices)].join(' ') };
}

function validateSchedules(rows) {
  if (!Array.isArray(rows) || rows.length > MAX_SCHEDULES) throw new Error('最多可保存 200 個排程。');
  const ids = new Set();
  return rows.map((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row) || typeof row.id !== 'string' ||
      !row.id || row.id.length > 100 || ids.has(row.id) || !isValidTime(row.time) ||
      typeof row.title !== 'string' || row.title.length > 30 ||
      !Number.isInteger(row.duration) || row.duration < 1 || row.duration > 720 ||
      typeof row.enabled !== 'boolean' || typeof row.url !== 'string' ||
      (row.catchUp !== undefined && typeof row.catchUp !== 'boolean')) throw new Error('排程格式錯誤或 ID 重複，請重新載入。');
    if (row.url && !normalizeUrl(row.url)) throw new Error('專注網址只接受 HTTPS，不能包含帳號或密碼。');
    ids.add(row.id);
    return cleanSchedule(row);
  });
}

function scheduleDocument(schedules) { return { schemaVersion: SCHEMA_VERSION, schedules }; }

function timeToMinutes(time) {
  if (!isValidTime(time)) return null;
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}

function intervalSegments(schedule) {
  const start = timeToMinutes(schedule.time);
  if (start === null) return [];
  const end = start + cleanSchedule(schedule).duration;
  if (end <= 1440) return [[start, end]];
  return [[start, 1440], [0, end - 1440]];
}

function schedulesOverlap(first, second) {
  if (!first?.enabled || !second?.enabled) return false;
  return intervalSegments(first).some(([firstStart, firstEnd]) =>
    intervalSegments(second).some(([secondStart, secondEnd]) =>
      firstStart < secondEnd && secondStart < firstEnd
    )
  );
}

function findOverlappingPair(schedules) {
  const enabled = (Array.isArray(schedules) ? schedules : [])
    .filter((schedule) => schedule && typeof schedule === 'object' && schedule.enabled)
    .map(cleanSchedule);
  for (let first = 0; first < enabled.length; first += 1) {
    for (let second = first + 1; second < enabled.length; second += 1) {
      if (schedulesOverlap(enabled[first], enabled[second])) return [enabled[first], enabled[second]];
    }
  }
  return null;
}

const ALLOWED_SHORTCUTS = [
  'CommandOrControl+Alt+P',
  'CommandOrControl+Alt+F',
  'CommandOrControl+Shift+P',
  'Alt+Shift+P'
];

function normalizeShortcut(shortcut) {
  return ALLOWED_SHORTCUTS.includes(shortcut) ? shortcut : ALLOWED_SHORTCUTS[0];
}

function shortcutCandidates(shortcut) {
  const preferred = normalizeShortcut(shortcut);
  return [preferred, ...ALLOWED_SHORTCUTS.filter((item) => item !== preferred)];
}

function isSameOriginUrl(originalUrl, nextUrl) {
  try {
    return Boolean(normalizeUrl(originalUrl) && normalizeUrl(nextUrl)) && new URL(originalUrl).origin === new URL(nextUrl).origin;
  } catch {
    return false;
  }
}

function lastRunDateAfterEdit(previousSchedule, nextSchedule) {
  if (!previousSchedule) return String(nextSchedule?.lastRunDate || '');
  return previousSchedule.time === nextSchedule.time
    ? String(previousSchedule.lastRunDate || '')
    : '';
}

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function localTimeKey(date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function dueOccurrence(schedule, now) {
  if (!schedule?.enabled || !isValidTime(schedule.time) || !Number.isFinite(now.getTime())) return null;
  const [hour, minute] = schedule.time.split(':').map(Number);
  const start = new Date(now);
  start.setHours(hour, minute, 0, 0);
  if (start > now) { start.setDate(start.getDate() - 1); start.setHours(hour, minute, 0, 0); }
  const elapsed = now - start;
  const windowMs = schedule.catchUp === false ? 60000 : 5 * 60000;
  const runDate = localDateKey(start);
  if (elapsed < 0 || elapsed >= windowMs || schedule.lastRunDate === runDate) return null;
  return { runDate, key: `${runDate}/${schedule.id}/${schedule.time}` };
}
function shouldStart(schedule, now) { return Boolean(dueOccurrence(schedule, now)); }

const focusClockLogic = {
  normalizeUrl,
  isValidTime,
  cleanSchedule,
  SCHEMA_VERSION, MAX_SCHEDULES, makeScheduleId, decodeSchedules, validateSchedules, scheduleDocument,
  timeToMinutes,
  schedulesOverlap,
  findOverlappingPair,
  ALLOWED_SHORTCUTS,
  normalizeShortcut,
  shortcutCandidates,
  isSameOriginUrl,
  lastRunDateAfterEdit,
  localDateKey,
  localTimeKey,
  shouldStart, dueOccurrence
};

if (typeof module !== 'undefined' && module.exports) module.exports = focusClockLogic;
if (typeof window !== 'undefined') window.focusClockLogic = focusClockLogic;
