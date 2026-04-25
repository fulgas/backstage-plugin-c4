/**
 * E2E tests for the payment-service component context diagram.
 *
 * Run:  npx playwright test --config e2e/playwright.config.ts component-payment-service
 */

import { diagramSuite, SCREENSHOT_ONLY } from './diagram-helpers';

// payment-service has subcomponents but renders no internal nodes in context view.
diagramSuite(
  'payment-service component',
  '/c4/default/component/payment-service',
  'component-payment-service',
  SCREENSHOT_ONLY,
);
