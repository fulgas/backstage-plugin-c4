/**
 * E2E tests for the storefront-api component context diagram.
 *
 * Run:  npx playwright test --config e2e/playwright.config.ts component-storefront-api
 */

import { diagramSuite, FULL } from './diagram-helpers';

diagramSuite(
  'storefront-api component',
  '/c4/default/component/storefront-api',
  'component-storefront-api',
  FULL,
);
