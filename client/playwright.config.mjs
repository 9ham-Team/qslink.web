import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: '*.spec.mjs',
  outputDir: '../test-results',
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: 'http://127.0.0.1:18787',
    locale: 'zh-CN',
    launchOptions: process.env.QSL_BROWSER_CHANNEL ? { channel: process.env.QSL_BROWSER_CHANNEL } : {},
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true } },
  ],
});
