// 只在隔離 CI 的 FocusClockQA 模擬器安裝並測試，不操作使用者手機。
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const { verifyTestEmulator } = require('./android-test-device');
const root = path.resolve(__dirname, '..');
function adb(args) {
  const result = spawnSync('adb', args, { encoding: 'utf8', timeout: 120000, windowsHide: true });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr || 'ADB failed');
  return result.stdout.trim();
}
try {
  if (process.env.GITHUB_ACTIONS !== 'true') throw new Error('此入口只供 GitHub 隔離測試環境使用。');
  const serials = adb(['devices']).split(/\r?\n/)
    .map(line => /^(emulator-\d+)\s+device$/.exec(line)?.[1]).filter(Boolean);
  if (serials.length !== 1) throw new Error('必須只有一個已就緒的測試模擬器。');
  const serial = serials[0];
  const name = verifyTestEmulator(serial);
  const apk = path.join(root, 'android/app/build/outputs/apk/debug/app-debug.apk');
  if (!fs.existsSync(apk)) throw new Error('找不到本次建置 APK，不使用舊附件代替。');
  const reportDir = path.join(root, 'test-results/android');
  // 裝置資訊先保留在 Playwright 輸出目錄以外，測試啟動會清理輸出目錄。
  const deviceInfo = {
    serial, avd: name,
    android: adb(['-s', serial, 'shell', 'getprop', 'ro.build.version.release']),
    webview: adb(['-s', serial, 'shell', 'dumpsys', 'webviewupdate'])
  };
  console.log(`Installing this build on ${name} (${serial})`);
  adb(['-s', serial, 'install', '-r', apk]);
  const result = spawnSync(process.execPath, [require.resolve('@playwright/test/cli'), 'test', '-c', 'playwright.android.config.js'], {
    cwd: root, stdio: 'inherit', windowsHide: true,
    env: { ...process.env, FOCUS_ANDROID_SERIAL: serial }
  });
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(path.join(reportDir, 'device.json'), JSON.stringify(deviceInfo, null, 2));
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
