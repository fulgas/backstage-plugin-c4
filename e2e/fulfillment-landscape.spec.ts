/**
 * E2E tests for the fulfillment domain landscape diagram.
 *
 * Run:  npx playwright test --config e2e/playwright.config.ts fulfillment-landscape
 */

import { diagramSuite, FULL } from './diagram-helpers';

diagramSuite(
  'fulfillment landscape',
  '/c4/default/domain/fulfillment',
  'fulfillment',
  FULL,
);
