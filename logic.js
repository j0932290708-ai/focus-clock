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
  const duration = Math.max(1, Math.min(720, Number(schedule.duration) || 45));

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
  localDateKey,
  localTimeKey,
  shouldStart
};
