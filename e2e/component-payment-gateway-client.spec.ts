/**
 * E2E tests for the payment-gateway-client component context diagram.
 *
 * Run:  npx playwright test --config e2e/playwright.config.ts component-payment-gateway-client
 */

import { diagramSuite, SCREENSHOT_ONLY } from './diagram-helpers';

// payment-gateway-client is a subcomponent consuming an external API — renders no nodes.
diagramSuite(
  'payment-gateway-client component',
  '/c4/default/component/payment-gateway-client',
  'component-payment-gateway-client',
  SCREENSHOT_ONLY,
);
