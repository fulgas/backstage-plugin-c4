/**
 * E2E tests for the auth system context diagram.
 * Auth has auth-service, auth-admin-ui; provides auth-api; consumed by all domains.
 *
 * Run:  npx playwright test --config e2e/playwright.config.ts system-auth
 */

import { diagramSuite, FULL } from './diagram-helpers';

diagramSuite('auth system', '/c4/default/system/auth', 'system-auth', FULL);
