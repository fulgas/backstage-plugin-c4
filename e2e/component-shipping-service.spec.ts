/**
 * E2E tests for the shipping-service component context diagram.
 *
 * Run:  npx playwright test --config e2e/playwright.config.ts component-shipping-service
 */

import { diagramSuite, FULL } from './diagram-helpers';

diagramSuite(
  'shipping-service component',
  '/c4/default/component/shipping-service',
  'component-shipping-service',
  FULL,
);
