const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../service-worker.js'), 'utf8');
function worker(scope) {
  const handlers = {}; const entries = new Map(); const deleted = []; let fetched = 0;
  const cache = { addAll: async (files) => files.forEach((file) => entries.set(new URL(file, scope).href, file)), match: async (url) => entries.get(url) };
  const prefix = `focus-clock-${new URL(scope).pathname}-`;
  const names = new Set([prefix + 'previous', 'other-app-v1']);
  vm.runInNewContext(source, { URL, self: { registration: { scope }, location: new URL(scope), addEventListener: (name, fn) => { handlers[name] = fn; },
    skipWaiting: async () => {}, clients: { claim: async () => {} } }, caches: { open: async (name) => { names.add(name); return cache; },
    keys: async () => [...names], delete: async (key) => { deleted.push(key); return names.delete(key); } }, fetch: async () => { fetched++; throw new Error('OFFLINE'); } });
  return { handlers, deleted, names, get fetched() { return fetched; }, async lifecycle(name) {
    const pending = []; handlers[name]({ waitUntil: (promise) => pending.push(promise) }); await Promise.all(pending);
  }, async request(url, method = 'GET') {
    let response; handlers.fetch({ request: { url: new URL(url, scope).href, method }, respondWith: (promise) => { response = promise; } }); return response;
  } };
}
for (const scope of ['https://example.com/', 'https://example.com/focus-clock/']) {
  test(`FC-P1-01：離線快取忽略 App query，支援 ${scope}`, async () => {
    const app = worker(scope); await app.lifecycle('install');
    assert.equal(await app.request('focus.html?web=1'), './focus.html');
    assert.equal(await app.request('index.html?focus=ended'), './index.html');
    assert.equal(await app.request('./'), './'); assert.equal(app.fetched, 0);
    assert.equal(await app.request('https://other.invalid/focus.html?web=1'), undefined);
    assert.equal(await app.request('api?web=1'), undefined);
    assert.equal(await app.request('focus.html', 'POST'), undefined);
    await app.lifecycle('activate'); assert.deepEqual(app.deleted, [`focus-clock-${new URL(scope).pathname}-previous`]);
    assert.equal(app.names.size, 2); // 保留目前版本與其他 App，不綁死特定版號。
    assert.ok(app.names.has('other-app-v1'));
  });
}
