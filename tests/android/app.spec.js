// 僅在專用 FocusClockQA 模擬器執行，會清除該模擬器內本 App 的測試資料。
// 不連接使用者手機。操作的是 APK 內真正的 Android WebView，不是手機尺寸網頁。
const { test, expect, _android } = require('@playwright/test');
const { verifyTestEmulator } = require('../../scripts/android-test-device');
const pkg = 'tw.student.focusclock';
let device;
let page;

test.beforeAll(async () => {
  const serial = process.env.FOCUS_ANDROID_SERIAL;
  if (!/^emulator-\d+$/.test(serial || '')) throw new Error('請指定專用模擬器 FOCUS_ANDROID_SERIAL。');
  const devices = await _android.devices({ omitDriverInstall: true });
  device = devices.find(item => item.serial() === serial);
  if (!device) throw new Error('指定的模擬器未連線。');
  verifyTestEmulator(serial);
  device.setDefaultTimeout(20000);
});

async function launch() {
  await device.shell(`am start -n ${pkg}/.MainActivity`);
  const webview = await device.webView({ pkg });
  page = await webview.page();
  page.setDefaultTimeout(15000);
  await expect(page.locator('#schedule-form')).toBeVisible();
}

test.beforeEach(async () => {
  await device.shell(`am force-stop ${pkg}`);
  expect((await device.shell(`pm clear ${pkg}`)).toString()).toContain('Success');
  await launch();
});

test.afterEach(async ({}, info) => {
  if (page && !page.isClosed()) {
    await info.attach('Android WebView 畫面', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  }
  if (device) await device.shell(`am force-stop ${pkg}`);
});
test.afterAll(async () => { if (device) await device.close(); });

async function add({ title = 'Android 測試', duration = '45', url = '' } = {}) {
  await page.locator('#title').fill(title);
  await page.locator('#duration').fill(duration);
  await page.locator('#focus-url').fill(url);
  await page.locator('#enabled').uncheck();
  await page.getByRole('button', { name: '儲存自律時鐘', exact: true }).click();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
}
async function exit() {
  await page.locator('#direct-exit-button').click();
  await page.locator('#confirm-unlock').click();
  await expect(page.locator('#schedule-form')).toBeVisible();
}

test('APK 安裝辨識、新增修改、開關、重啟保存及刪除後改時間', async () => {
  await expect(page.locator('html')).toHaveAttribute('data-platform', 'android');
  await expect(page.locator('#install-app-button')).toBeDisabled();
  await expect(page.locator('#install-app-button')).toHaveText('已安裝');
  await add();
  await page.locator('.card-toggle').check();
  await expect(page.locator('.card-toggle')).toBeChecked();
  await page.locator('.card-toggle').uncheck();
  await page.getByRole('button', { name: '編輯', exact: true }).click();
  await page.locator('#start-hour').selectOption('11');
  await page.locator('#start-minute').selectOption('25');
  await page.getByRole('button', { name: '儲存自律時鐘', exact: true }).click();
  await expect(page.locator('.schedule-time')).toHaveText('11:25');
  // 一般 Android 使用情境會先回到主畫面，再由系統停止 App；讓 WebView 完成落盤。
  await device.shell('input keyevent KEYCODE_HOME');
  await device.shell('sleep 1');
  await device.shell(`am force-stop ${pkg}`);
  await launch();
  await expect(page.locator('.schedule-time')).toHaveText('11:25');
  await expect(page.locator('.card-toggle')).not.toBeChecked();
  await page.getByRole('button', { name: '編輯', exact: true }).click();
  await page.getByRole('button', { name: '刪除', exact: true }).click();
  await page.locator('#action-confirm button[value=cancel]').click();
  await expect(page.locator('.schedule-card')).toHaveCount(1);
  await page.getByRole('button', { name: '刪除', exact: true }).click();
  await page.locator('#action-confirm button[value=confirm]').click();
  await expect(page.locator('.schedule-card')).toHaveCount(0);
  await page.locator('#start-hour').selectOption('12');
  await page.locator('#start-minute').selectOption('40');
  await expect(page.locator('#start-hour')).toHaveValue('12');
  await expect(page.locator('#start-minute')).toHaveValue('40');
});

test('過勞提醒、HTTPS 驗證、清除重填、匯出備份文字及關閉', async () => {
  await page.locator('#duration').fill('61');
  await expect(page.locator('#overwork-warning')).toBeVisible();
  await page.locator('#focus-url').fill('http://example.com');
  await page.getByRole('button', { name: '儲存自律時鐘', exact: true }).click();
  await expect(page.locator('#form-message')).toContainText('只接受 HTTPS');
  await page.locator('#reset-button').click();
  await expect(page.locator('#duration')).toHaveValue('45');
  await expect(page.locator('#focus-url')).toHaveValue('');
  await add();
  await page.locator('#export-schedules').click();
  const backup = JSON.parse(await page.locator('#backup-text').inputValue());
  expect(backup.schemaVersion).toBe(1);
  expect(backup.schedules[0].title).toBe('Android 測試');
  await page.locator('#export-dialog').getByRole('button', { name: '關閉', exact: true }).click();
  await expect(page.locator('#export-dialog')).not.toBeVisible();
});

test('專注倒數、直接結束取消確認、背景返回仍可結束', async () => {
  await add();
  await page.getByRole('button', { name: '安全測試', exact: true }).click();
  await expect(page.locator('#lock-screen')).toBeVisible();
  await expect(page.locator('#countdown')).not.toHaveText('--:--');
  await page.locator('#direct-exit-button').click();
  await page.locator('#cancel-unlock').click();
  await expect(page.locator('#unlock-confirm')).not.toBeVisible();
  await device.shell('input keyevent KEYCODE_HOME');
  await device.shell(`am start -n ${pkg}/.MainActivity`);
  await expect(page.locator('#countdown')).toBeVisible();
  await exit();
  await expect(page.locator('.schedule-card')).toHaveCount(1);
});

test('網站備案按鈕、倒數與直接結束', async () => {
  await add({ url: 'https://example.com' });
  await page.getByRole('button', { name: '安全測試', exact: true }).click();
  await expect(page.locator('#web-help')).toBeVisible();
  await expect(page.locator('#open-focus-site')).toHaveAttribute('href', /https:\/\/example.com/);
  await page.locator('#use-lock-screen').click();
  await expect(page.locator('#lock-screen')).toBeVisible();
  await expect(page.locator('#countdown')).not.toHaveText('--:--');
  await exit();
});
