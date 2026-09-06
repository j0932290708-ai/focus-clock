const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests/android',
  timeout: 90000,
  workers: 1,
  retries: 0,
  outputDir: 'test-results/android',
  reporter: [['list'], ['html', { outputFolder: 'playwright-report/android', open: 'never' }],
    ['json', { outputFile: 'playwright-report/android/results.json' }]],
});
