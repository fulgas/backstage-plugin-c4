/**
 * E2E tests for the ordering system context diagram.
 * Ordering has order-service, notification-worker, and related resources; consumes payment, auth.
 *
 * Run:  npx playwright test --config e2e/playwright.config.ts system-ordering
 */

import { diagramSuite, FULL } from './diagram-helpers';

diagramSuite(
  'ordering system',
  '/c4/default/system/ordering',
  'system-ordering',
  FULL,
);
