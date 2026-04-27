import * as path from 'path';
import { defineConfig, devices } from '@playwright/test';

const STATE_FILE = path.join(__dirname, '.auth-state.json');

export default defineConfig({
  testDir: '.',
  testMatch: [
    // C4 page (listing, filters, navigation)
    'c4-page.spec.ts',
    // Domain landscape diagrams
    'domain-external-services.spec.ts',
    'fulfillment-landscape.spec.ts',
    'payments-capture.spec.ts',
    'platform-domain.spec.ts',
    'retail-landscape.spec.ts',
    // System context diagrams
    'system-analytics.spec.ts',
    'system-auth.spec.ts',
    'system-external-services.spec.ts',
    'system-inventory.spec.ts',
    'system-ordering.spec.ts',
    'system-payment-processing.spec.ts',
    'system-shipping.spec.ts',
    'system-storefront.spec.ts',
    // Component context diagrams
    'component-analytics-api.spec.ts',
    'component-auth-admin-ui.spec.ts',
    'component-auth-service.spec.ts',
    'component-event-collector.spec.ts',
    'component-fraud-checker.spec.ts',
    'component-inventory-service.spec.ts',
    'component-notification-worker.spec.ts',
    'component-order-service.spec.ts',
    'component-payment-gateway-client.spec.ts',
    'component-payment-service.spec.ts',
    'component-replenishment-worker.spec.ts',
    'component-reporting-ui.spec.ts',
    'component-shipping-service.spec.ts',
    'component-storefront-api.spec.ts',
    'component-tracking-worker.spec.ts',
    'component-web-app.spec.ts',
  ],
  outputDir: './test-results',
  fullyParallel: false,
  workers: 4,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 8_000 },
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
