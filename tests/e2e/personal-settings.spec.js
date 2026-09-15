const { test, expect } = require('@playwright/test');
const { AxeBuilder } = require('@axe-core/playwright');
const path = require('node:path');
const mp3 = path.join(__dirname, '../fixtures/chime.mp3');

async function monitorAudio(page) {
  await page.addInitScript(() => {
    const NativeAudio = window.Audio;
    window.__audio = [];
    window.Audio = function(...args) { const audio = new NativeAudio(...args); window.__audio.push(audio); return audio; };
  });
}
async function start(page) {
  await page.locator('#duration').fill('1');
  await page.locator('#enabled').uncheck();
  await page.getByRole('button', { name: '儲存自律時鐘', exact: true }).click();
  await page.getByRole('button', { name: '安全測試', exact: true }).click();
  await expect(page.locator('#countdown')).toHaveText('01:00');
}
test('深色偏好重開保留、跨計時頁同步，深色介面對比可讀', async ({ page }, info) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('./');
  await page.getByRole('button', { name: '深色模式', exact: true }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect((await new AxeBuilder({ page }).withTags(['wcag2aa']).analyze()).violations).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('home-dark.png'), fullPage: true });
  await start(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('#countdown')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('focus-dark.png') });
  expect((await new AxeBuilder({ page }).withTags(['wcag2aa']).analyze()).violations).toEqual([]);
  await page.getByRole('button', { name: '淺色模式', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.screenshot({ path: test.info().outputPath('focus-light.png') });
});
test('已安裝主畫面 App 不顯示安裝卡，也沒有原平台說明卡', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(navigator, 'standalone', { value: true }); });
  await page.goto('./');
  await expect(page.locator('#web-app-note')).toBeHidden();
  await expect(page.locator('.platform-status')).toHaveCount(0);
});
test('Android App 不顯示安裝區塊', async ({ page }) => {
  await page.addInitScript(() => {
    window.__nativeDisplayCalls = [];
    window.Capacitor = {
      isNativePlatform: () => true,
      Plugins: { FocusDisplay: { setFullscreen: async ({ enabled }) => {
        window.__nativeDisplayCalls.push(enabled);
        return { enabled };
      } } }
    };
  });
  await page.goto('./');
  await expect(page.locator('html')).toHaveAttribute('data-platform', 'android');
  await expect(page.locator('#web-app-note')).toBeHidden();
  await expect(page.locator('.platform-status')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__nativeDisplayCalls)).toEqual([false]);
  await start(page);
  await expect(page.locator('#fullscreen-button')).toHaveText('離開全螢幕');
  await page.locator('#fullscreen-button').click();
  await expect(page.locator('#fullscreen-button')).toHaveText('全螢幕');
  await page.locator('#fullscreen-button').click();
  await expect(page.locator('#fullscreen-button')).toHaveText('離開全螢幕');
  expect(await page.evaluate(() => window.__nativeDisplayCalls)).toEqual([true, false, true]);
  await page.locator('#direct-exit-button').click();
  await page.locator('#confirm-unlock').click();
  await expect(page.locator('#schedule-form')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__nativeDisplayCalls)).toEqual([false]);
});
test('完成安裝事件即時隱藏安裝區塊', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('#web-app-note')).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  await expect(page.locator('#web-app-note')).toBeHidden();
});
test('MP3 實際播放、停止、重開保留與恢复內建', async ({ page }) => {
  await monitorAudio(page); await page.goto('./');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '選擇 MP3', exact: true }).click();
  await (await chooser).setFiles(mp3);
  await expect(page.locator('#ringtone-name')).toHaveText('chime.mp3');
  await page.reload();
  await expect(page.locator('#ringtone-name')).toHaveText('chime.mp3');
  await page.getByRole('button', { name: '試聽鈴聲', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__audio[0].currentTime)).toBeGreaterThan(0);
  await page.getByRole('button', { name: '停止試聽', exact: true }).click();
  expect(await page.evaluate(() => window.__audio[0].paused)).toBe(true);
  await page.getByRole('button', { name: '恢復內建', exact: true }).click();
  await expect(page.locator('#ringtone-name')).toHaveText('內建鈴聲');
  await page.reload(); await expect(page.locator('#ringtone-name')).toHaveText('內建鈴聲');
});
test('錯誤與超大 MP3 不會覆蓋既有鈴聲', async ({ page }) => {
  await page.goto('./'); await page.locator('#ringtone-file').setInputFiles(mp3);
  await expect(page.locator('#ringtone-name')).toHaveText('chime.mp3');
  await page.locator('#ringtone-file').setInputFiles({ name: 'broken.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from('not audio') });
  await expect(page.locator('#ringtone-message')).toContainText('無法播放');
  await page.locator('#ringtone-file').setInputFiles({ name: 'too-large.mp3', mimeType: 'audio/mpeg', buffer: Buffer.alloc(10 * 1024 * 1024 + 1) });
  await expect(page.locator('#ringtone-message')).toContainText('10 MB');
  await page.reload(); await expect(page.locator('#ringtone-name')).toHaveText('chime.mp3');
});
test('到時自選 MP3 響鈴，停止返回，手動退出不響鈴', async ({ page }) => {
  await monitorAudio(page);
  await page.clock.install({ time: new Date('2026-09-12T08:00:00+08:00') });
  await page.goto('./'); await page.locator('#ringtone-file').setInputFiles(mp3);
  await expect(page.locator('#ringtone-name')).toHaveText('chime.mp3');
  await start(page);
  await page.getByRole('button', { name: '啟用結束鈴聲', exact: true }).click();
  await expect(page.locator('#arm-alarm')).toBeHidden();
  await page.clock.fastForward(60000);
  await expect(page.locator('#completion-dialog')).toBeVisible();
  await expect(page.locator('#completion-message')).toContainText('鈴聲已響起');
  expect(await page.evaluate(() => ({ src: window.__audio[0].src.startsWith('blob:'), paused: window.__audio[0].paused }))).toEqual({ src: true, paused: false });
  await page.getByRole('button', { name: '停止鈴聲並返回', exact: true }).click();
  await expect(page).toHaveURL(/index\.html/);
  await page.getByRole('button', { name: '安全測試', exact: true }).click();
  await page.getByRole('button', { name: '直接結束', exact: true }).click();
  await page.locator('#confirm-unlock').click();
  await expect(page).toHaveURL(/index\.html/);
  await expect(page.locator('#alarm-dialog')).toBeHidden();
});
test('全螢幕可進入與離開', async ({ page }) => {
  await page.goto('./'); await start(page);
  await expect(page.locator('#fullscreen-button')).toBeEnabled();
  if (!await page.evaluate(() => Boolean(document.fullscreenElement))) await page.getByRole('button', { name: '全螢幕', exact: true }).click();
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
  await page.getByRole('button', { name: '離開全螢幕', exact: true }).click();
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false);
  await expect(page.getByRole('button', { name: '全螢幕', exact: true })).toBeVisible();
});
test('橫向時鐘及結束按鈕不超出畫面', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('./'); await start(page);
  await expect(page.locator('#countdown')).toBeInViewport();
  await expect(page.locator('#direct-exit-button')).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('focus-landscape.png') });
});
test('自動音訊被拒絕時保留播放與退出按鈕', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-12T08:00:00+08:00') });
  await page.addInitScript(() => { HTMLMediaElement.prototype.play = () => Promise.reject(new DOMException('Blocked', 'NotAllowedError')); });
  await page.goto('./'); await start(page); await page.clock.fastForward(60000);
  await expect(page.getByRole('button', { name: '播放鈴聲', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '播放鈴聲', exact: true }).click();
  await expect(page.locator('#completion-dialog')).toBeVisible();
  await page.getByRole('button', { name: '停止鈴聲並返回', exact: true }).click();
  await expect(page).toHaveURL(/index\.html/);
});
