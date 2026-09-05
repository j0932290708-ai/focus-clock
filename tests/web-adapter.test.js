const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const logic = require('../logic');
const source = fs.readFileSync(path.join(__dirname, '../web-adapter.js'), 'utf8');
const rendererSource = fs.readFileSync(path.join(__dirname, '../renderer.js'), 'utf8');
const key = 'focus-clock-schedules';
const row = { id: 'test', title: '讀書', time: '08:30', duration: 45, enabled: true, url: '' };
function storage(data, fail = false) {
  return { getItem: (key) => data.get(key) ?? null, removeItem: (key) => data.delete(key),
    setItem(key, value) { if (fail) throw new Error('QuotaExceededError'); data.set(key, value); } };
}
function run({ saved = [row], localFail = false, sessionFail = false, sessionData = new Map(), localData, hidden = false } = {}) {
  const data = localData || new Map([[key, JSON.stringify(saved)]]);
  const events = {}; const timers = []; const intervals = []; const navigations = [];
  const warning = {};
  const fixed = new Date(2026, 8, 3, 8, 30, 10);
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [fixed.getTime()])); } static now() { return fixed.getTime(); } }
  const window = { focusClockLogic: logic, addEventListener: (name, fn) => { events[name] = fn; } };
  vm.runInNewContext(source, { window, document: { visibilityState: hidden ? 'hidden' : 'visible', documentElement: { dataset: {} },
    querySelector: (selector) => selector === '#data-warning' ? warning : null, addEventListener() {} },
    navigator: {}, localStorage: storage(data, localFail), sessionStorage: storage(sessionData, sessionFail),
    location: { protocol: 'https:', hostname: 'test.invalid', assign: (url) => navigations.push(url) },
    // 刻意不提供 structuredClone，模擬 Android 11 的舊版 System WebView。
    setTimeout: (fn) => timers.push(fn), setInterval: (fn) => intervals.push(fn), Date: Clock, URLSearchParams });
  return { api: window.focusClock, data, sessionData, warning, intervals, navigations, flush: () => timers.splice(0).forEach((fn) => fn()) };
}
test('FC-P1-02：localStorage 配額滿仍啟動，返回／重載不重複啟動', () => {
  const first = run({ localFail: true });
  first.flush(); assert.equal(first.navigations.length, 1);
  assert.match(first.warning.textContent, /無法保存/);
  assert.match(JSON.parse(first.sessionData.get('focus-clock-current')).warning, /無法保存/);
  first.intervals.forEach((fn) => fn()); first.flush(); assert.equal(first.navigations.length, 1);
  first.sessionData.delete('focus-clock-current');
  const second = run({ localFail: false, sessionData: first.sessionData });
  second.flush(); assert.equal(second.navigations.length, 0);
});
test('FC-P1-02：sessionStorage 不可用時顯示錯誤，不進入沒有倒數的白頁', () => {
  const result = run({ sessionFail: true }); result.flush();
  assert.equal(result.navigations.length, 0); assert.match(result.warning.textContent, /無法保存本次倒數/);
});
test('FC-P1-02：手動儲存失敗保留舊資料；重複 ID 儲存遭拒', async () => {
  const result = run({ localFail: true, hidden: true });
  const response = await result.api.saveSchedules([{ ...row, time: '10:00' }]);
  assert.equal(response.ok, false); assert.equal((await result.api.getSchedules())[0].time, '08:30');
  assert.equal((await result.api.saveSchedules([row, { ...row, time: '10:00' }])).ok, false);
});
test('FC-P3-01：損壞 localStorage 從備份讀取，但不覆寫原文', async () => {
  const data = new Map([[key, '{broken'], [key + '-backup', JSON.stringify([{ ...row, enabled: false }])]]);
  const result = run({ localData: data });
  assert.equal((await result.api.getSchedules()).length, 1);
  assert.equal(data.get(key), '{broken'); assert.match(result.warning.textContent, /備份復原/);
  assert.equal([...data.entries()].find(([name]) => name.startsWith(key + '-corrupt-'))[1], '{broken');
});
test('FC-P2-02：在背景不啟動；手動啟動拒絕不安全網址', async () => {
  const result = run({ hidden: true }); result.flush(); assert.equal(result.navigations.length, 0);
  assert.equal((await result.api.startFocus({ ...row, url: 'http://example.com' })).ok, false);
});
test('Android 11 舊版 WebView 不依賴 replaceAll 或 structuredClone', () => {
  assert.doesNotMatch(rendererSource, /\.replaceAll\(/);
  assert.doesNotMatch(source, /\bstructuredClone\s*\(/);
});
