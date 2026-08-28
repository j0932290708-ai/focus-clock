const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeUrl, isValidTime, cleanSchedule, shouldStart,
  schedulesOverlap, findOverlappingPair, normalizeShortcut, shortcutCandidates, isSameOriginUrl,
  lastRunDateAfterEdit
} = require('../logic');

test('網址沒有 https 時會自動補上', () => {
  assert.equal(normalizeUrl('example.com'), 'https://example.com/');
});

test('只接受正確的 24 小時制時間', () => {
  assert.equal(isValidTime('08:30'), true);
  assert.equal(isValidTime('25:70'), false);
});

test('持續時間最少一分鐘、最多十二小時', () => {
  assert.equal(cleanSchedule({ duration: 0 }).duration, 1);
  assert.equal(cleanSchedule({ duration: 999 }).duration, 720);
  assert.equal(cleanSchedule({ duration: 12.8 }).duration, 12);
  assert.equal(cleanSchedule({ duration: '錯誤' }).duration, 45);
  assert.equal(cleanSchedule(null).title, '讀書');
  assert.equal(cleanSchedule('損壞資料').time, '08:30');
});

test('同一排程一天只啟動一次', () => {
  const now = new Date(2026, 7, 27, 8, 30);
  const schedule = { enabled: true, time: '08:30', lastRunDate: '' };
  assert.equal(shouldStart(schedule, now), true);
  schedule.lastRunDate = '2026-08-27';
  assert.equal(shouldStart(schedule, now), false);
});

test('已啟用排程的時間區間不能重疊', () => {
  const first = { id: 'a', enabled: true, time: '08:30', duration: 45 };
  const overlap = { id: 'b', enabled: true, time: '09:00', duration: 30 };
  const next = { id: 'c', enabled: true, time: '09:15', duration: 30 };
  assert.equal(schedulesOverlap(first, overlap), true);
  assert.equal(schedulesOverlap(first, next), false);
  overlap.enabled = false;
  assert.equal(schedulesOverlap(first, overlap), false);
});

test('跨午夜排程也能正確檢查重疊', () => {
  const late = { id: 'a', enabled: true, time: '23:30', duration: 60 };
  const early = { id: 'b', enabled: true, time: '00:15', duration: 30 };
  assert.equal(schedulesOverlap(late, early), true);
  assert.deepEqual(findOverlappingPair([late, early]).map((item) => item.id), ['a', 'b']);
  assert.equal(findOverlappingPair(null), null);
});

test('快捷鍵只接受介面提供的安全選項', () => {
  assert.equal(normalizeShortcut('Alt+Shift+P'), 'Alt+Shift+P');
  assert.equal(normalizeShortcut('任意文字'), 'CommandOrControl+Alt+P');
});

test('啟動時會先嘗試已選快捷鍵，再嘗試其他安全選項', () => {
  const candidates = shortcutCandidates('Alt+Shift+P');
  assert.equal(candidates[0], 'Alt+Shift+P');
  assert.equal(new Set(candidates).size, 4);
});

test('專注網頁只允許原本網域內導航', () => {
  assert.equal(isSameOriginUrl('https://example.com/study', 'https://example.com/next'), true);
  assert.equal(isSameOriginUrl('https://example.com', 'https://other.example.com'), false);
});

test('修改開始時間時會清除今天已執行狀態', () => {
  const previous = { time: '08:30', lastRunDate: '2026-08-28' };
  assert.equal(lastRunDateAfterEdit(previous, { time: '09:00' }), '');
  assert.equal(lastRunDateAfterEdit(previous, { time: '08:30' }), '2026-08-28');
});
