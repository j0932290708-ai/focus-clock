const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createStore } = require('../storage');
const validate = (v) => { if (!Number.isInteger(v.count)) throw new Error('invalid'); return v; };
async function setup(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'focus-storage-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return path.join(dir, 'data.json');
}
test('FC-P1-05：依序原子更新並保留上一版備份', async (t) => {
  const file = await setup(t);
  const store = await createStore(file, { count: 0 }, validate);
  await Promise.all([store.update((v) => ({ count: v.count + 1 })), store.update((v) => ({ count: v.count + 1 }))]);
  assert.deepEqual(JSON.parse(await fs.readFile(file)), { count: 2 });
  assert.deepEqual(JSON.parse(await fs.readFile(file + '.bak')), { count: 1 });
});
test('FC-P1-05：rename／磁碟故障保留原資料，後續仍能重試', async (t) => {
  const file = await setup(t);
  await fs.writeFile(file, '{"count":1}');
  let fail = true;
  const io = { ...fs, rename: async (from, to) => { if (to === file && fail) { const e = new Error('disk full'); e.code = 'ENOSPC'; throw e; } return fs.rename(from, to); } };
  const store = await createStore(file, {}, validate, () => {}, io);
  await assert.rejects(store.update(() => ({ count: 2 })));
  assert.equal(store.read().count, 1);
  assert.equal(JSON.parse(await fs.readFile(file)).count, 1);
  fail = false;
  await store.update(() => ({ count: 3 }));
  assert.equal(store.read().count, 3);
});
test('FC-P1-05：損壞 JSON 隔離原檔並從備份恢复', async (t) => {
  const file = await setup(t);
  await fs.writeFile(file, '{broken');
  await fs.writeFile(file + '.bak', '{"count":7}');
  const warnings = [];
  const store = await createStore(file, { count: 0 }, validate, (m) => warnings.push(m));
  assert.equal(store.read().count, 7);
  assert.ok(warnings.some((m) => m.includes('復原')));
  const corrupt = (await fs.readdir(path.dirname(file))).find((name) => name.includes('.corrupt-'));
  assert.equal(await fs.readFile(path.join(path.dirname(file), corrupt), 'utf8'), '{broken');
  await store.update(() => ({ count: 8 }));
  assert.equal(JSON.parse(await fs.readFile(file + '.bak')).count, 7);
});
test('FC-P1-05：中斷留下的暫存檔不會被當成正式資料', async (t) => {
  const file = await setup(t);
  await fs.writeFile(file, '{"count":1}');
  await fs.writeFile(file + '.interrupted.tmp', '{broken');
  const store = await createStore(file, {}, validate);
  assert.equal(store.read().count, 1);
  await assert.rejects(store.update(() => ({ count: 'bad' })));
  assert.equal(store.read().count, 1);
});
