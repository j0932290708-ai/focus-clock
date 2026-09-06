const { defineConfig, devices } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }], ['json', { outputFile: 'playwright-report/results.json' }]],
  use: { baseURL: process.env.FOCUS_TEST_BASE_URL || 'http://127.0.0.1:4174/focus-clock/', timezoneId: 'Asia/Taipei', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-layout', use: { ...devices['Pixel 7'] } }
  ],
  webServer: process.env.FOCUS_TEST_BASE_URL ? undefined : { command: 'node scripts/test-server.js', url: 'http://127.0.0.1:4174/focus-clock/', reuseExistingServer: !process.env.CI }
});
