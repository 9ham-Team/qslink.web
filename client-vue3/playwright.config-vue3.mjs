import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e-vue3',
  testMatch: '*-vue3.spec.mjs',
  outputDir: '../test-results-vue3',
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: 'http://127.0.0.1:18787',
    locale: 'zh-CN',
    launchOptions: process.env.QSL_BROWSER_CHANNEL_VUE3 ? { channel: process.env.QSL_BROWSER_CHANNEL_VUE3 } : {},
  },
  projects: [
    { name: 'desktop-vue3', use: { viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile-vue3', use: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true } },
  ],
});
