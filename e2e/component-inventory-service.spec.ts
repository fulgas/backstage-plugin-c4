/**
 * E2E tests for the inventory-service component context diagram.
 *
 * Run:  npx playwright test --config e2e/playwright.config.ts component-inventory-service
 */

import { diagramSuite, FULL } from './diagram-helpers';

diagramSuite(
  'inventory-service component',
  '/c4/default/component/inventory-service',
  'component-inventory-service',
  FULL,
);
