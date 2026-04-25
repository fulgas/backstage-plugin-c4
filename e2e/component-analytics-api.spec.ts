/**
 * E2E tests for the analytics-api component context diagram.
 *
 * Run:  npx playwright test --config e2e/playwright.config.ts component-analytics-api
 */

import { diagramSuite, FULL } from './diagram-helpers';

diagramSuite(
  'analytics-api component',
  '/c4/default/component/analytics-api',
  'component-analytics-api',
  FULL,
);
