const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeUrl, isValidTime, cleanSchedule, shouldStart } = require('../logic');

test('網址沒有 https 時會自動補上', () => {
  assert.equal(normalizeUrl('example.com'), 'https://example.com/');
});

test('只接受正確的 24 小時制時間', () => {
  assert.equal(isValidTime('08:30'), true);
  assert.equal(isValidTime('25:70'), false);
});

test('持續時間最少一分鐘、最多十二小時', () => {
  assert.equal(cleanSchedule({ duration: 0 }).duration, 45);
  assert.equal(cleanSchedule({ duration: 999 }).duration, 720);
});

test('同一排程一天只啟動一次', () => {
  const now = new Date(2026, 7, 27, 8, 30);
  const schedule = { enabled: true, time: '08:30', lastRunDate: '' };
  assert.equal(shouldStart(schedule, now), true);
  schedule.lastRunDate = '2026-08-27';
  assert.equal(shouldStart(schedule, now), false);
});
