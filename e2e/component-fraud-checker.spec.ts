/**
 * E2E tests for the fraud-checker component context diagram.
 *
 * Run:  npx playwright test --config e2e/playwright.config.ts component-fraud-checker
 */

import { diagramSuite, SCREENSHOT_ONLY } from './diagram-helpers';

// fraud-checker is a subcomponent with no direct API relationships in scope — renders no nodes.
diagramSuite(
  'fraud-checker component',
  '/c4/default/component/fraud-checker',
  'component-fraud-checker',
  SCREENSHOT_ONLY,
);
