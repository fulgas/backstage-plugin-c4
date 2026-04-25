/**
 * E2E tests for the shipping system context diagram.
 * Shipping has shipping-service, tracking-worker; consumes order-api, inventory-api, carrier-api.
 *
 * Run:  npx playwright test --config e2e/playwright.config.ts system-shipping
 */

import { diagramSuite, FULL } from './diagram-helpers';

diagramSuite(
  'shipping system',
  '/c4/default/system/shipping',
  'system-shipping',
  FULL,
);
