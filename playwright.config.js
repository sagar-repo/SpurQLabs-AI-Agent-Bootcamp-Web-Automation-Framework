const { defineConfig, devices } = require('@playwright/test');
const config = require('./src/utils/ConfigManager');

module.exports = defineConfig({
  testDir: './src/features',
  timeout: config.getStepTimeout(),
  expect: {
    timeout: config.getShortTimeout()
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : config.getRetryCount(),
  workers: process.env.CI ? 1 : 1,
  reporter: [
    ['html', { outputFolder: 'reports/playwright-report' }],
    ['json', { outputFile: 'reports/playwright-results.json' }]
  ],
  use: {
    baseURL: config.getBaseURL(),
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    headless: config.isHeadless(),
    viewport: config.getViewport(),
    ignoreHTTPSErrors: true,
    acceptDownloads: true
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
  ],
});
