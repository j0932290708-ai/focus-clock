// 原生測試可能開啟全螢幕視窗。預設禁止啟動，避免無人操作時反覆彈出崩潰框。
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const args = process.argv.slice(2);
if (!args.includes('--allow-window')) {
  console.error('桌面視窗測試已暫停：尚未通過原生驗收。這次不會啟動 Electron。');
  console.error('只有確認執行環境正常，並明確同意開啟測試視窗後，才可加上 --allow-window。');
  process.exitCode = 2;
} else {
  const result = spawnSync(process.execPath, [
    require.resolve('@playwright/test/cli'), 'test', '-c', 'playwright.electron.config.js',
    ...args.filter(arg => arg !== '--allow-window')
  ], {
    cwd: path.resolve(__dirname, '..'), stdio: 'inherit', windowsHide: true,
    env: { ...process.env, FOCUS_DESKTOP_WINDOW_CONFIRMED: '1' }
  });
  if (result.error) console.error(result.error.message);
  process.exitCode = result.status ?? 1;
}
