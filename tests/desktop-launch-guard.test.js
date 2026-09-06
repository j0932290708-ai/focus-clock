const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

test('桌面測試預設明確阻擋，不啟動視窗、不冒充測試通過', () => {
  const result = spawnSync(process.execPath, [path.resolve(__dirname, '../scripts/run-desktop-tests.js')], {
    encoding: 'utf8', timeout: 5000, windowsHide: true
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /桌面視窗測試已暫停/);
  assert.match(result.stderr, /不會啟動 Electron/);
});

test('原生測試首次失敗即停止，不能自動重試崩潰視窗', () => {
  const config = require('../playwright.electron.config');
  assert.equal(config.maxFailures, 1);
  assert.equal(config.retries, 0);
  assert.equal(config.workers, 1);
});
