/**
 * E2E tests for the web-app component context diagram.
 *
 * Run:  npx playwright test --config e2e/playwright.config.ts component-web-app
 */

import { diagramSuite, FULL } from './diagram-helpers';

diagramSuite(
  'web-app component',
  '/c4/default/component/web-app',
  'component-web-app',
  FULL,
);
