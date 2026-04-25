/**
 * E2E tests for the order-service component context diagram.
 *
 * Run:  npx playwright test --config e2e/playwright.config.ts component-order-service
 */

import { diagramSuite, FULL } from './diagram-helpers';

diagramSuite(
  'order-service component',
  '/c4/default/component/order-service',
  'component-order-service',
  FULL,
);
