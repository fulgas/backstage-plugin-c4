/**
 * E2E tests for the reporting-ui component context diagram.
 *
 * Run:  npx playwright test --config e2e/playwright.config.ts component-reporting-ui
 */

import { diagramSuite, FULL } from './diagram-helpers';

diagramSuite(
  'reporting-ui component',
  '/c4/default/component/reporting-ui',
  'component-reporting-ui',
  FULL,
);
