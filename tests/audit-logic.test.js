const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const logic = require('../logic');
const row = (extra = {}) => ({ id: 'a', title: '讀書', time: '08:00', duration: 60, url: '', enabled: true, ...extra });

test('FC-P1-03：相同 ID 不能讓兩笔重疊排程通過', () => {
  assert.ok(logic.findOverlappingPair([row(), row({ time: '08:30' })]));
  assert.throws(() => logic.validateSchedules([row(), row({ time: '09:00' })]), /ID/);
});
test('FC-P1-03：讀取舊格式修復重複 ID，停用衝突但不刪資料', () => {
  const decoded = logic.decodeSchedules([row(), row({ time: '08:30' })]);
  assert.equal(new Set(decoded.schedules.map((s) => s.id)).size, 2);
  assert.equal(decoded.schedules[1].enabled, false);
  assert.match(decoded.message, /ID/);
  assert.deepEqual(logic.decodeSchedules([row(), row({ time: '08:30' })]), decoded);
});
test('FC-P1-06：拒絕 HTTP、外部協定、帳密與過長網址', () => {
  for (const url of ['http://example.com', 'http://localhost:3000', 'javascript:alert(1)', 'file:///secret', 'https://u:p@example.com', 'https://' + 'a'.repeat(2050)]) assert.equal(logic.normalizeUrl(url), '');
  assert.equal(logic.isSameOriginUrl('https://example.com', 'http://example.com'), false);
  assert.throws(() => logic.validateSchedules([row({ url: 'http://example.com' })]), /HTTPS/);
});
test('FC-P1-06：舊 HTTP 排程停用並要求重新設定', () => {
  const result = logic.decodeSchedules([row({ url: 'http://example.com' })]);
  assert.equal(result.schedules[0].enabled, false);
  assert.match(result.message, /HTTPS/);
});
test('FC-P2-01：5 分鐘寬限、可關閉、不提早與不重複', () => {
  assert.equal(logic.shouldStart(row(), new Date(2026, 8, 3, 8, 4, 59)), true);
  assert.equal(logic.shouldStart(row(), new Date(2026, 8, 3, 8, 5)), false);
  assert.equal(logic.shouldStart(row({ catchUp: false }), new Date(2026, 8, 3, 8, 1)), false);
  assert.equal(logic.shouldStart(row(), new Date(2026, 8, 3, 7, 59)), false);
  assert.equal(logic.shouldStart(row({ lastRunDate: '2026-09-03' }), new Date(2026, 8, 3, 8, 2)), false);
});
test('FC-P2-01：跨午夜補跑記錄前一天，換日不重跑', () => {
  const value = row({ time: '23:59' });
  const now = new Date(2026, 8, 4, 0, 2);
  assert.equal(logic.dueOccurrence(value, now).runDate, '2026-09-03');
  assert.equal(logic.shouldStart({ ...value, lastRunDate: '2026-09-03' }, now), false);
});
test('FC-P3-01：版本化匯出再匯入、未知 schema 拒絕、限制數量', () => {
  const rows = logic.validateSchedules([row()]);
  assert.deepEqual(logic.decodeSchedules(JSON.parse(JSON.stringify(logic.scheduleDocument(rows)))).schedules, rows);
  assert.throws(() => logic.decodeSchedules({ schemaVersion: 999, schedules: [] }));
  assert.throws(() => logic.decodeSchedules([null]));
  assert.throws(() => logic.validateSchedules(Array.from({ length: 201 }, (_, i) => row({ id: String(i) }))));
});
test('FC-P2-01：時區依裝置當地時間，不以 UTC 日期誤判或重跑', () => {
  for (const zone of ['Asia/Taipei', 'America/New_York', 'UTC']) {
    const script = `const l = require('./logic'); const now = new Date(2026, 8, 3, 0, 1); const row = {id:'t',enabled:true,time:'23:58'}; const first = l.dueOccurrence(row,now); if(first.runDate !== '2026-09-02' || l.dueOccurrence({...row,lastRunDate:first.runDate},now)) process.exit(1);`;
    assert.doesNotThrow(() => execFileSync(process.execPath, ['-e', script], { cwd: require('node:path').join(__dirname, '..'), env: { ...process.env, TZ: zone } }));
  }
});
