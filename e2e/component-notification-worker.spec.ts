/**
 * E2E tests for the notification-worker component context diagram.
 *
 * Run:  npx playwright test --config e2e/playwright.config.ts component-notification-worker
 */

import { diagramSuite, FULL } from './diagram-helpers';

diagramSuite(
  'notification-worker component',
  '/c4/default/component/notification-worker',
  'component-notification-worker',
  FULL,
);
