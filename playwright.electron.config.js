const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests/native', testMatch: '*.spec.js', workers: 1, timeout: 90000,
  // 第一次失敗即停止，禁止因其他案例／重試而反覆啟動崩潰的原生程式。
  maxFailures: 1, retries: 0,
  outputDir: 'test-results/native',
  reporter: [['list'], ['json', { outputFile: 'test-results/native/results.json' }]],
  use: { trace: 'retain-on-failure' }
});
