// 這個檔案只放不需要畫面的共用規則，方便測試與閱讀。

function normalizeUrl(input) {
  const text = String(input || '').trim();
  if (!text) return '';

  const withProtocol = /^https?:\/\//i.test(text) ? text : `https://${text}`;

  try {
    const url = new URL(withProtocol);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
  } catch {
    return '';
  }
}

function isValidTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ''));
}

function cleanSchedule(schedule) {
  const rawDuration = Number(schedule.duration);
  const duration = Number.isFinite(rawDuration)
    ? Math.max(1, Math.min(720, Math.trunc(rawDuration)))
    : 45;

  return {
    id: String(schedule.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`),
    title: String(schedule.title || '讀書').trim().slice(0, 30) || '讀書',
    time: isValidTime(schedule.time) ? schedule.time : '08:30',
    duration,
    url: normalizeUrl(schedule.url),
    enabled: schedule.enabled !== false,
    lastRunDate: String(schedule.lastRunDate || '')
  };
}

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
  if (!first?.enabled || !second?.enabled || first.id === second.id) return false;
  return intervalSegments(first).some(([firstStart, firstEnd]) =>
    intervalSegments(second).some(([secondStart, secondEnd]) =>
      firstStart < secondEnd && secondStart < firstEnd
    )
  );
}

function findOverlappingPair(schedules) {
  const enabled = schedules.filter((schedule) => schedule.enabled).map(cleanSchedule);
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

function isSameOriginUrl(originalUrl, nextUrl) {
  try {
    return new URL(originalUrl).origin === new URL(nextUrl).origin;
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

function shouldStart(schedule, now) {
  return Boolean(
    schedule.enabled &&
    schedule.time === localTimeKey(now) &&
    schedule.lastRunDate !== localDateKey(now)
  );
}

module.exports = {
  normalizeUrl,
  isValidTime,
  cleanSchedule,
  timeToMinutes,
  schedulesOverlap,
  findOverlappingPair,
  ALLOWED_SHORTCUTS,
  normalizeShortcut,
  isSameOriginUrl,
  lastRunDateAfterEdit,
  localDateKey,
  localTimeKey,
  shouldStart
};
