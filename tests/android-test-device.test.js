const test = require('node:test');
const assert = require('node:assert/strict');
const { parseTestAvdName, verifyTestEmulator } = require('../scripts/android-test-device');

test('Android 模擬器名稱檢查接受成功回覆，不依賴映像 getprop 欄位', () => {
  assert.equal(parseTestAvdName('FocusClockQA30\nOK\n'), 'FocusClockQA30');
  assert.equal(parseTestAvdName('FocusClockQA36\r\nOK\r\n'), 'FocusClockQA36');
});
test('Android 模擬器驗證拒絕錯誤、空白與非測試名稱', () => {
  for (const value of ['', 'Pixel7\nOK', 'FocusClockQA30\nKO', 'FocusClockQA30', 'FocusClockQA30\nOK\nPixel']) {
    assert.throws(() => parseTestAvdName(value));
  }
  assert.throws(() => verifyTestEmulator('real-phone-serial'));
});
