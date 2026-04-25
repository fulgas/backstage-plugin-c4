/**
 * E2E tests for the payment-processing system context diagram.
 * payment-processing has payment-service with subcomponents (payment-gateway-client, fraud-checker).
 *
 * Run:  npx playwright test --config e2e/playwright.config.ts system-payment-processing
 */

import { diagramSuite, FULL } from './diagram-helpers';

diagramSuite(
  'payment-processing system',
  '/c4/default/system/payment-processing',
  'system-payment-processing',
  FULL,
);
