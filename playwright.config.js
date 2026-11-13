import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.browser.spec.mjs',
  workers: 1,
  timeout: 60000,
  use: { viewport: { width: 1440, height: 1000 }, headless: true },
  projects: [
    { name: 'chrome', use: { channel: 'chrome' } },
    { name: 'edge', use: { channel: 'msedge' } }
  ],
  reporter: 'list'
});
