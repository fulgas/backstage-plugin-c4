/**
 * E2E tests for the analytics system context diagram.
 * Analytics has event-collector, analytics-api, reporting-ui; all consume auth-api.
 *
 * Run:  npx playwright test --config e2e/playwright.config.ts system-analytics
 */

import { diagramSuite, FULL } from './diagram-helpers';

diagramSuite(
  'analytics system',
  '/c4/default/system/analytics',
  'system-analytics',
  FULL,
);
