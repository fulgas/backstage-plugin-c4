/**
 * E2E tests for the auth-service component context diagram.
 *
 * Run:  npx playwright test --config e2e/playwright.config.ts component-auth-service
 */

import { diagramSuite, FULL } from './diagram-helpers';

diagramSuite(
  'auth-service component',
  '/c4/default/component/auth-service',
  'component-auth-service',
  FULL,
);
