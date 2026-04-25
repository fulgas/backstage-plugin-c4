/**
 * E2E tests for the tracking-worker component context diagram.
 *
 * Run:  npx playwright test --config e2e/playwright.config.ts component-tracking-worker
 */

import { diagramSuite, FULL } from './diagram-helpers';

diagramSuite(
  'tracking-worker component',
  '/c4/default/component/tracking-worker',
  'component-tracking-worker',
  FULL,
);
