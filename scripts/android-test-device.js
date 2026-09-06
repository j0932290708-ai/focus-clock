const { spawnSync } = require('node:child_process');

function parseTestAvdName(output) {
  const lines = output.trim().split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length !== 2 || !/^FocusClockQA\d+$/.test(lines[0]) || lines[1] !== 'OK') {
    throw new Error('拒絕操作非 FocusClockQA 測試模擬器，或名稱查詢未成功。');
  }
  return lines[0];
}

function verifyTestEmulator(serial) {
  if (!/^emulator-\d+$/.test(serial || '')) throw new Error('不允許操作實體裝置。');
  // 系統 getprop 的 AVD 名称欄位隨映像版本不同；改向該模擬器控制台查詢。
  const result = spawnSync('adb', ['-s', serial, 'emu', 'avd', 'name'], {
    encoding: 'utf8', timeout: 10000, windowsHide: true
  });
  if (result.error || result.status !== 0) throw new Error('無法驗證測試模擬器身分，停止操作。');
  return parseTestAvdName(result.stdout);
}

module.exports = { verifyTestEmulator, parseTestAvdName };
