/**
 * E2E tests for the auth-admin-ui component context diagram.
 *
 * Run:  npx playwright test --config e2e/playwright.config.ts component-auth-admin-ui
 */

import { diagramSuite, FULL } from './diagram-helpers';

diagramSuite(
  'auth-admin-ui component',
  '/c4/default/component/auth-admin-ui',
  'component-auth-admin-ui',
  FULL,
);
