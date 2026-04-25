/**
 * E2E tests for the replenishment-worker component context diagram.
 *
 * Run:  npx playwright test --config e2e/playwright.config.ts component-replenishment-worker
 */

import { diagramSuite, FULL } from './diagram-helpers';

diagramSuite(
  'replenishment-worker component',
  '/c4/default/component/replenishment-worker',
  'component-replenishment-worker',
  FULL,
);
