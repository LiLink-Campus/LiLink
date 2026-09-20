import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

if (!process.env.E2E_WORKSPACE || !process.env.E2E_WEB_URL) {
  throw new Error('Use npm run test:e2e:web; direct runs must not target development or production.');
}
export default defineConfig({
  testDir: './e2e/specs',
  timeout: 45_000,
  expect: { timeout: 10_000, toHaveScreenshot: { maxDiffPixelRatio: 0.002 } },
  fullyParallel: false,
  updateSnapshots: 'none',
  workers: 1,
  forbidOnly: !!process.env.CI,
  failOnFlakyTests: true,
  retries: process.env.CI ? 1 : 0,
  outputDir: path.join(process.env.E2E_OUTPUT!, 'results'),
  snapshotPathTemplate: `${process.env.E2E_SOURCE_ROOT}/e2e/baselines/{platform}/{projectName}/{testFilePath}/{arg}{ext}`,
  reporter: [['list'], ['html', { outputFolder: path.join(process.env.E2E_OUTPUT!, 'report'), open: 'never' }], ['json', { outputFile: path.join(process.env.E2E_OUTPUT!, 'results.json') }]],
  use: {
    baseURL: process.env.E2E_WEB_URL, actionTimeout: 10_000, navigationTimeout: 20_000,
    locale: 'zh-CN', timezoneId: 'Asia/Shanghai', contextOptions: { reducedMotion: 'reduce' },
    serviceWorkers: 'block', trace: 'retain-on-failure', screenshot: 'only-on-failure', video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1280, height: 800 } } },
    { name: 'mobile-webkit', use: { ...devices['iPhone 13'] } },
  ],
});
