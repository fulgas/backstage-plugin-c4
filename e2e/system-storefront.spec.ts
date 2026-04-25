/**
 * E2E tests for the storefront system context diagram.
 * Storefront has web-app, storefront-api, product-cache; consumes ordering, auth, inventory.
 *
 * Run:  npx playwright test --config e2e/playwright.config.ts system-storefront
 */

import { diagramSuite, FULL } from './diagram-helpers';

diagramSuite(
  'storefront system',
  '/c4/default/system/storefront',
  'system-storefront',
  FULL,
);
