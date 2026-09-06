const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const logic = require('../logic');
const source = fs.readFileSync(path.join(__dirname, '../focus.js'), 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));
async function focus({ desktop = false, malformed = false, preview = false } = {}) {
  let now = 100000; let id = 0; let requested = 0; let released = 0; let unlocked = 0;
  const elements = new Map(); const windowEvents = {}; const documentEvents = {}; const intervals = new Map();
  const snapshots = new Map(); const navigations = [];
  const snapshot = { id: 'test', title: '讀書', time: '08:30', duration: 120, url: '', enabled: true, preview, startedAt: now, endsAt: now + 120 * 60000 };
  snapshots.set('focus-clock-current', malformed ? '{broken' : JSON.stringify(snapshot));
  const document = { visibilityState: 'visible', documentElement: { dataset: {} }, activeElement: null,
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, { hidden: true, style: {}, events: {},
        addEventListener(name, fn) { this.events[name] = fn; }, focus() { document.activeElement = this; },
        removeAttribute(name) { delete this[name]; }, setPointerCapture() {} });
      return elements.get(selector);
    }, addEventListener: (name, fn) => { documentEvents[name] = fn; } };
  const context = { document, window: { focusClockLogic: logic, addEventListener: (name, fn) => { windowEvents[name] = fn; },
    ...(desktop ? { focusSession: { getCurrent: async () => snapshot, emergencyUnlock: async () => { unlocked++; }, onNotice() {}, onLoadFailed() {} } } : {}) },
    navigator: { wakeLock: { request: async () => { requested++; return { addEventListener() {}, release: async () => { released++; } }; } } },
    sessionStorage: { getItem: key => snapshots.get(key) || null, removeItem: key => snapshots.delete(key) },
    location: { replace: url => navigations.push(url) }, Date: { now: () => now },
    setInterval(fn) { const key = ++id; intervals.set(key, fn); return key; }, clearInterval(key) { intervals.delete(key); },
    setTimeout() { return ++id; }, clearTimeout() {} };
  vm.runInNewContext(source, context); await settle();
  return { element: selector => document.querySelector(selector), windowEvents, documentEvents, document, snapshots, navigations,
    get requested() { return requested; }, get released() { return released; }, get unlocked() { return unlocked; },
    advance(ms) { now += ms; [...intervals.values()].forEach(fn => fn()); },
    async visibility(state) { document.visibilityState = state; documentEvents.visibilitychange(); await settle(); } };
}
test('FC-P2-05：Wake Lock 隱藏釋放、返回重取、離開釋放', async () => {
  const app = await focus(); assert.equal(app.requested, 1);
  await app.visibility('hidden'); assert.equal(app.released, 1);
  await app.visibility('visible'); assert.equal(app.requested, 2);
  app.windowEvents.pagehide(); await settle(); assert.equal(app.released, 2);
});
test('FC-P2-05/08：pointercancel、blur 取消長按，鍵盤按住五秒開確認', async () => {
  const app = await focus({ desktop: true }); const button = app.element('#emergency-button');
  button.events.pointerdown({ button: 0, pointerId: 1 }); app.advance(2000); button.events.pointercancel(); app.advance(5000);
  assert.equal(app.element('#unlock-confirm').hidden, true);
  button.events.keydown({ key: 'Enter', repeat: false, preventDefault() {} }); app.windowEvents.blur(); app.advance(5000);
  assert.equal(app.element('#unlock-confirm').hidden, true);
  button.events.keydown({ key: ' ', repeat: false, preventDefault() {} }); app.advance(5000);
  assert.equal(app.element('#unlock-confirm').hidden, false);
  assert.equal(app.document.activeElement, app.element('#cancel-unlock'));
  assert.equal(app.unlocked, 0);
  app.element('#confirm-unlock').events.click(); assert.equal(app.unlocked, 1);
});
test('安全測試畫面層備援：Shift+S、Escape 與右鍵都能退出', async () => {
  const app = await focus({ desktop: true, preview: true });
  let prevented = 0;
  app.windowEvents.keydown({ key: 'S', shiftKey: true, ctrlKey: false, altKey: false, preventDefault() { prevented++; } });
  app.windowEvents.keydown({ key: 'Escape', shiftKey: false, ctrlKey: false, altKey: false, preventDefault() { prevented++; } });
  app.windowEvents.contextmenu({ preventDefault() { prevented++; } });
  assert.equal(app.unlocked, 3);
  assert.equal(prevented, 3);
});
test('FC-P2-06：內建備案、休息提醒與倒數完成不依賴遠端頁面', async () => {
  const app = await focus(); app.advance(60 * 60000);
  assert.equal(app.element('#rest-reminder').hidden, false);
  app.element('#continue-button').events.click(); assert.equal(app.element('#rest-reminder').hidden, true);
  app.element('#use-lock-screen').events.click(); assert.equal(app.element('#web-area').hidden, true);
  assert.equal(app.element('#lock-screen').hidden, false);
  app.advance(60 * 60000); assert.deepEqual(app.navigations, ['index.html?focus=completed']);
  assert.equal(app.snapshots.has('focus-clock-current'), false);
});
test('FC-P1-01：損壞專注快照返回首頁，不停在空白倒數', async () => {
  const app = await focus({ malformed: true }); assert.deepEqual(app.navigations, ['index.html']);
});
test('FC-P2-05：BFCache 還原後重新啟動畫面倒數', async () => {
  const app = await focus(); app.windowEvents.pagehide(); app.advance(60000);
  app.windowEvents.pageshow({ persisted: true });
  assert.equal(app.element('#countdown').textContent, '01:59:00');
  app.advance(60000); assert.equal(app.element('#countdown').textContent, '01:58:00');
});
