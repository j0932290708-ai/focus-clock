const { test, expect, _electron } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
let desktop, page, profile;
test.beforeEach(async ({}, info) => {
  if (process.env.FOCUS_DESKTOP_WINDOW_CONFIRMED !== '1') {
    throw new Error('桌面測試已暫停，不啟動 Electron；需先明確同意測試視窗。');
  }
  profile = info.outputPath('profile'); await fs.mkdir(profile, { recursive: true });
  desktop = await _electron.launch({
    args: [path.join(__dirname, 'entry.js')], cwd: path.resolve(__dirname, '../..'), timeout: 20000,
    chromiumSandbox: true, env: { ...process.env, FOCUS_TEST_PROFILE: profile }
  });
  page = await desktop.firstWindow();
  await expect(page.getByRole('heading', { name: '專注番茄鐘', exact: true })).toBeVisible();
});
test.afterEach(async () => { if (desktop) await desktop.close(); desktop = null; });
async function add({ title = '桌面驗收', duration = '2' } = {}) {
  await page.locator('#title').fill(title); await page.locator('#duration').fill(duration);
  await page.locator('#enabled').uncheck();
  await page.getByRole('button', { name: '儲存自律時鐘', exact: true }).click();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
}
async function preview() {
  const pending = desktop.waitForEvent('window');
  await page.getByRole('button', { name: '安全測試', exact: true }).click();
  const focus = await pending;
  await expect(focus.locator('#mode-label')).toHaveText('安全測試模式');
  return focus;
}
test('桌面 CRUD、時間選單、四組快捷鍵套用、備份保存', async () => {
  await add();
  for (const shortcut of ['CommandOrControl+Alt+F', 'CommandOrControl+Shift+P', 'Alt+Shift+P', 'CommandOrControl+Alt+P']) {
    await page.locator('#shortcut-select').selectOption(shortcut);
    await page.getByRole('button', { name: '套用快捷鍵', exact: true }).click();
    const settings = await page.evaluate(() => window.focusClock.getSettings());
    expect(settings.shortcutEnabled).toBe(true); expect(settings.shortcut).toBe(shortcut);
  }
  await page.getByRole('checkbox', { name: '啟用或停用 桌面驗收', exact: true }).check();
  await page.getByRole('checkbox', { name: '啟用或停用 桌面驗收', exact: true }).uncheck();
  await page.getByRole('button', { name: '編輯', exact: true }).click();
  await page.locator('#start-hour').selectOption('12'); await page.locator('#start-minute').selectOption('42');
  await page.getByRole('button', { name: '儲存自律時鐘', exact: true }).click();
  await expect(page.getByText('12:42', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '匯出備份', exact: true }).click();
  const backup = JSON.parse(await page.locator('#backup-text').inputValue());
  expect(backup.schedules[0].time).toBe('12:42');
  const exportPath = path.join(profile, 'export.json');
  // Electron 使用原生下載流程；測試指定隔離輸出位置，不等待瀏覽器專用 download 事件。
  // 仍實際按下載按鈕、等候 DownloadItem 完成並核對磁碟內容，不偽造備份檔。
  await desktop.evaluate(({ app, session }, savePath) => {
    app.qaBackupDownload = { state: 'waiting' };
    session.defaultSession.once('will-download', (_event, item) => {
      app.qaBackupDownload = { state: 'started', name: item.getFilename() };
      item.setSavePath(savePath);
      item.once('done', (_doneEvent, state) => { app.qaBackupDownload.state = state; });
    });
  }, exportPath);
  await page.locator('#backup-download').click();
  await expect.poll(() => desktop.evaluate(({ app }) => app.qaBackupDownload.state), { timeout: 10000 }).toBe('completed');
  expect(await desktop.evaluate(({ app }) => app.qaBackupDownload.name)).toBe('focus-clock-backup.json');
  expect(JSON.parse(await fs.readFile(exportPath, 'utf8'))).toEqual(backup);
  await page.getByRole('button', { name: '關閉', exact: true }).click();
  await page.getByRole('button', { name: '編輯', exact: true }).click();
  await page.getByRole('button', { name: '刪除', exact: true }).click();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await page.getByRole('button', { name: '刪除', exact: true }).click();
  await page.getByRole('button', { name: '確認', exact: true }).click();
  await page.locator('#start-hour').selectOption('13'); await expect(page.locator('#start-hour')).toHaveValue('13');
  const chooser = page.waitForEvent('filechooser'); await page.getByRole('button', { name: '匯入備份', exact: true }).click();
  await (await chooser).setFiles(path.join(profile, 'export.json'));
  await page.getByRole('button', { name: '確認', exact: true }).click();
  await expect(page.getByText('12:42', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '清除重填', exact: true }).click();
  await expect(page.locator('#duration')).toHaveValue('45');
  await desktop.close(); desktop = null;
  const saved = JSON.parse(await fs.readFile(path.join(profile, 'schedules.json'), 'utf8'));
  expect(saved.schedules[0].time).toBe('12:42');
});
test('安全測試 Shift+S、右鍵、Escape 及滑鼠和鍵盤長按退出', async () => {
  await add();
  for (const action of ['shift', 'right', 'escape', 'mouse', 'keyboard']) {
    const focus = await preview(); const closed = focus.waitForEvent('close');
    if (action === 'shift') await focus.keyboard.press('Shift+S').catch(() => {});
    if (action === 'right') await focus.locator('#lock-screen').click({ button: 'right' }).catch(() => {});
    if (action === 'escape') await focus.keyboard.press('Escape').catch(() => {});
    if (action === 'mouse') {
      await focus.locator('#emergency-button').hover(); await focus.mouse.down();
      await closed; await page.mouse.up();
    }
    if (action === 'keyboard') {
      await focus.locator('#emergency-button').focus(); await focus.keyboard.down('Space');
      await closed; await page.keyboard.up('Space');
    }
    await closed; await expect(page.locator('#schedule-count')).toHaveText('1 個');
  }
});
test('真正排程開啟正式視窗、長按取消及確認解鎖', async () => {
  await add();
  await page.getByRole('button', { name: '編輯', exact: true }).click();
  const now = new Date();
  await page.locator('#start-hour').selectOption(String(now.getHours()).padStart(2, '0'));
  await page.locator('#start-minute').selectOption(String(now.getMinutes()).padStart(2, '0'));
  await page.locator('#enabled').check(); const pending = desktop.waitForEvent('window');
  await page.getByRole('button', { name: '儲存自律時鐘', exact: true }).click();
  const focus = await pending; await expect(focus.locator('#mode-label')).toHaveText('專注進行中');
  const state = await desktop.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/focus.html'));
    return { kiosk: win.isKiosk(), top: win.isAlwaysOnTop(), sandbox: win.webContents.getLastWebPreferences().sandbox };
  });
  expect(state).toEqual({ kiosk: true, top: true, sandbox: true });
  await focus.locator('#emergency-button').focus(); await focus.keyboard.down('Enter');
  await expect(focus.getByRole('dialog')).toBeVisible({ timeout: 7000 }); await focus.keyboard.up('Enter');
  await focus.getByRole('button', { name: '繼續專注', exact: true }).click();
  await expect(focus.getByRole('dialog')).toBeHidden();
  await focus.locator('#emergency-button').hover(); await focus.mouse.down();
  await expect(focus.getByRole('dialog')).toBeVisible({ timeout: 7000 }); await focus.mouse.up();
  const closed = focus.waitForEvent('close'); await focus.getByRole('button', { name: '確定解鎖', exact: true }).click();
  await closed;
  const rows = await page.evaluate(() => window.focusClock.getSchedules());
  expect(rows[0].lastRunDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});
