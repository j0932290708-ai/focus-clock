// CI 使用獨立瀏覽器 context，不讀取使用者資料。手機尺寸不等於 Android 真機。
const { test, expect } = require('@playwright/test');
const schedulesKey = 'focus-clock-schedules';
test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-03T08:00:00+08:00') });
});
async function add(page, { title = '回歸測試', url = '', enabled = false } = {}) {
  await page.getByRole('textbox', { name: '這段時間要做什麼？', exact: true }).fill(title);
  await page.getByRole('textbox', { name: /^專注網址/ }).fill(url);
  await page.getByRole('checkbox', { name: '啟用排程', exact: true }).setChecked(enabled);
  await page.getByRole('button', { name: '儲存自律時鐘', exact: true }).click();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
}
async function readyOffline(page) {
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
}
async function exit(page) {
  await page.getByRole('button', { name: '直接結束', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '直接結束', exact: true }).click();
  await expect(page.getByRole('heading', { name: '專注番茄鐘', exact: true })).toBeVisible();
}
test('新增、修改、鍵盤切換、刪除後仍能選時間', async ({ page }) => {
  await page.goto('./'); await add(page);
  const toggle = page.getByRole('checkbox', { name: '啟用或停用 回歸測試', exact: true });
  const box = await toggle.boundingBox(); expect(box.width).toBeGreaterThan(0); expect(box.height).toBeGreaterThan(0);
  await toggle.focus(); await page.keyboard.press('Space'); await expect(toggle).toBeChecked(); await expect(toggle).toBeFocused();
  await page.getByRole('button', { name: '編輯', exact: true }).click();
  await page.getByRole('combobox', { name: '開始的小時' }).selectOption('11');
  await page.getByRole('combobox', { name: '開始的分鐘' }).selectOption('25');
  await page.getByRole('button', { name: '儲存自律時鐘', exact: true }).click();
  await expect(page.getByText('11:25', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '編輯', exact: true }).click();
  await page.getByRole('button', { name: '刪除', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '確認', exact: true }).click();
  await expect(page.getByText('還沒有排程', { exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: '開始的小時' }).selectOption('12');
  await expect(page.getByRole('combobox', { name: '開始的小時' })).toHaveValue('12');
});
test('HTTP 拒絕與過勞提醒', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('spinbutton').fill('61');
  await expect(page.locator('#overwork-warning')).toBeVisible();
  await page.getByRole('textbox', { name: /^專注網址/ }).fill('http://example.com');
  await page.getByRole('button', { name: '儲存自律時鐘' }).click();
  await expect(page.locator('#form-message')).toContainText('只接受 HTTPS');
  await expect(page.locator('.schedule-card')).toHaveCount(0);
});
test('離線安全測試、取消退出、確認退出', async ({ page, context }) => {
  await page.goto('./'); await add(page); await readyOffline(page); await context.setOffline(true);
  await page.getByRole('button', { name: '安全測試', exact: true }).click();
  await expect(page).toHaveURL(/focus\.html\?web=1/); await expect(page.locator('#countdown')).toHaveText('45:00');
  await page.getByRole('button', { name: '直接結束', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: '繼續專注' })).toBeFocused();
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toBeHidden();
  await exit(page); await expect(page.locator('#schedule-count')).toHaveText('1 個');
});
test('離線排程到點與倒數完成', async ({ page, context }) => {
  await page.goto('./'); await add(page, { enabled: true }); await readyOffline(page);
  await context.setOffline(true); await page.clock.fastForward(30 * 60000);
  await expect(page).toHaveURL(/focus\.html\?web=1/); await expect(page.locator('#session-title')).toHaveText('回歸測試');
  await page.clock.fastForward(45 * 60000); await expect(page).toHaveURL(/index\.html/);
  await expect(page.getByRole('heading', { name: '專注番茄鐘', exact: true })).toBeVisible();
});
test('到點配額滿仍啟動；結束與重載不重複', async ({ page }) => {
  await page.goto('./'); await add(page, { enabled: true });
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (this === localStorage) throw new DOMException('test quota', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await page.reload(); await page.clock.fastForward(30 * 60000);
  await expect(page).toHaveURL(/focus\.html/); await expect(page.locator('#focus-notice')).toContainText('無法保存');
  await exit(page); await page.reload(); await page.clock.runFor(2000);
  await expect(page).toHaveURL(/index\.html/); await expect(page.locator('#schedule-count')).toHaveText('1 個');
});
test('重複 ID 匯入可修復、匯出且編輯只改指定排程', async ({ page }) => {
  await page.goto('./');
  const rows = ['甲', '乙'].map((title) => ({ id: 'duplicate', title, time: '08:30', duration: 45, url: '', enabled: false }));
  await page.locator('#import-file').setInputFiles({ name: 'test.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(rows)) });
  await page.getByRole('dialog').getByRole('button', { name: '確認', exact: true }).click();
  await expect(page.locator('#schedule-count')).toHaveText('2 個');
  await page.locator('.schedule-card').filter({ has: page.getByRole('heading', { name: '乙', exact: true }) }).getByRole('button', { name: '編輯', exact: true }).click();
  await page.getByRole('textbox', { name: '這段時間要做什麼？', exact: true }).fill('乙修改');
  await page.getByRole('button', { name: '儲存自律時鐘', exact: true }).click();
  await expect(page.getByRole('heading', { name: '甲', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '匯出備份', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '備份內容' })).toBeVisible();
  expect(JSON.parse(await page.getByRole('textbox', { name: '備份內容' }).inputValue()).schemaVersion).toBe(1);
  const download = page.waitForEvent('download'); await page.getByRole('link', { name: '下載 JSON 備份', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('focus-clock-backup.json');
  const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), schedulesKey);
  expect(stored.schemaVersion).toBe(1); expect(new Set(stored.schedules.map(row => row.id)).size).toBe(2);
});
for (const mode of ['allowed', 'denied', 'dns-failed']) {
  test(`嵌入網站 ${mode} 都保留可操作備案`, async ({ page }) => {
    await page.route('https://study.invalid/**', route => mode === 'dns-failed' ? route.abort('namenotresolved') : route.fulfill({
      status: 200, contentType: 'text/html; charset=utf-8', headers: mode === 'denied' ? { 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "frame-ancestors 'none'" } : {}, body: '<!doctype html><meta charset="utf-8"><h1>學習範例</h1>'
    }));
    await page.goto('./'); await add(page, { url: 'https://study.invalid/' });
    await page.getByRole('button', { name: '安全測試', exact: true }).click();
    await expect(page.locator('#web-help')).toBeVisible();
    if (mode === 'allowed') await expect(page.frameLocator('#focus-frame').getByRole('heading', { name: '學習範例' })).toBeVisible();
    await page.locator('#use-lock-screen').click(); await expect(page.locator('#lock-screen')).toBeVisible();
    await expect(page.locator('#web-area')).toBeHidden(); await exit(page);
  });
}

test('清除重填、安裝說明、刪除取消與匯入取消', async ({ page }) => {
  await page.goto('./'); await add(page);
  await page.getByRole('textbox', { name: '這段時間要做什麼？', exact: true }).fill('暫存');
  await page.getByRole('spinbutton').fill('90');
  await page.locator('#catch-up').selectOption('no');
  await page.getByRole('button', { name: '清除重填', exact: true }).click();
  await expect(page.locator('#title')).toHaveValue('讀書');
  await expect(page.getByRole('spinbutton')).toHaveValue('45');
  await expect(page.locator('#catch-up')).toHaveValue('yes');
  await page.getByRole('button', { name: '安裝 App', exact: true }).click();
  await expect(page.locator('#install-help')).toBeVisible();
  await page.getByRole('button', { name: '刪除', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.locator('#schedule-count')).toHaveText('1 個');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '匯入備份', exact: true }).click();
  await (await chooser).setFiles(require.resolve('../fixtures/backup.json'));
  await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.getByRole('heading', { name: '回歸測試', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '匯出備份', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '關閉', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('滿一小時提醒可關閉、退出可取消且鍵盤焦點留在確認框', async ({ page }) => {
  await page.goto('./'); await page.getByRole('spinbutton').fill('61'); await add(page);
  await page.getByRole('button', { name: '安全測試', exact: true }).click();
  await expect(page.locator('#countdown')).toContainText('01:01:');
  await page.clock.fastForward(60 * 60000);
  await expect(page.locator('#rest-reminder')).toBeVisible();
  await page.getByRole('button', { name: '關閉提醒', exact: true }).click();
  await expect(page.locator('#rest-reminder')).toBeHidden();
  await page.getByRole('button', { name: '直接結束', exact: true }).click();
  await page.keyboard.press('Tab'); await expect(page.locator('#confirm-unlock')).toBeFocused();
  await page.keyboard.press('Tab'); await expect(page.locator('#cancel-unlock')).toBeFocused();
  await page.getByRole('button', { name: '繼續專注', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden(); await exit(page);
});

test('儲存失敗提示可關閉且不影響退出', async ({ page }) => {
  await page.goto('./'); await add(page, { enabled: true });
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (this === localStorage) throw new DOMException('test quota', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await page.clock.fastForward(30 * 60000);
  await expect(page.locator('#focus-notice')).toBeVisible();
  await page.getByRole('button', { name: '關閉提示', exact: true }).click();
  await expect(page.locator('#focus-notice')).toBeHidden(); await exit(page);
});

test('外開網站保持本頁倒數與結束按鈕', async ({ page, context }) => {
  await context.route('https://study.invalid/**', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<h1>Study</h1>' }));
  await page.goto('./'); await add(page, { url: 'https://study.invalid/' });
  await page.getByRole('button', { name: '安全測試', exact: true }).click();
  const popup = page.waitForEvent('popup');
  await page.getByRole('link', { name: '在瀏覽器開啟網站（此處倒數仍繼續）', exact: true }).click();
  const site = await popup; await expect(site.getByRole('heading', { name: 'Study', exact: true })).toBeVisible();
  await site.close(); await page.bringToFront();
  await expect(page.locator('#countdown')).not.toHaveText('--:--'); await exit(page);
});
