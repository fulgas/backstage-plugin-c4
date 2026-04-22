import * as path from 'path';
import { defineConfig, devices } from '@playwright/test';

const STATE_FILE = path.join(__dirname, '.auth-state.json');

export default defineConfig({
  testDir: '.',
  testMatch: [
    'fulfillment-landscape.spec.ts',
    'payments-capture.spec.ts',
    'retail-landscape.spec.ts',
  ],
  outputDir: './test-results',
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  globalSetup: './global-setup.ts',
  use: {
    baseURL: 'http://localhost:3000',
    storageState: STATE_FILE,
    video: 'on',
    screenshot: 'on',
    headless: true,
    viewport: { width: 1400, height: 900 },
  },
  reporter: [['html', { open: 'never', outputFolder: 'playwright-report' }]],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
