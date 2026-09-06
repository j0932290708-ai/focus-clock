const { test, expect } = require('@playwright/test');
const { AxeBuilder } = require('@axe-core/playwright');

async function check(page, info, label) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  await info.attach(label, { body: JSON.stringify(result, null, 2), contentType: 'application/json' });
  expect(result.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) }))).toEqual([]);
}
async function prepare(page) {
  await page.goto('./');
  await page.locator('#enabled').uncheck();
  await page.getByRole('button', { name: '儲存自律時鐘', exact: true }).click();
  await expect(page.locator('#schedule-count')).toHaveText('1 個');
}
test('無障礙：排程首頁及刪除確認', async ({ page }, info) => {
  await prepare(page); await check(page, info, 'home');
  await page.getByRole('button', { name: '刪除', exact: true }).click();
  await check(page, info, 'delete-dialog');
});
test('無障礙：備份文字與下載對話框', async ({ page }, info) => {
  await prepare(page);
  await page.getByRole('button', { name: '匯出備份', exact: true }).click();
  await check(page, info, 'export-dialog');
});
test('無障礙：專注畫面及直接退出確認', async ({ page }, info) => {
  await prepare(page);
  await page.getByRole('button', { name: '安全測試', exact: true }).click();
  await expect(page.locator('#countdown')).not.toHaveText('--:--');
  await check(page, info, 'focus');
  await page.getByRole('button', { name: '直接結束', exact: true }).click();
  await check(page, info, 'exit-dialog');
});
