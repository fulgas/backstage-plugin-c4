/**
 * E2E tests for the inventory system context diagram.
 * Inventory has inventory-service, replenishment-worker; provides inventory-api.
 *
 * Run:  npx playwright test --config e2e/playwright.config.ts system-inventory
 */

import { diagramSuite, FULL } from './diagram-helpers';

diagramSuite(
  'inventory system',
  '/c4/default/system/inventory',
  'system-inventory',
  FULL,
);
