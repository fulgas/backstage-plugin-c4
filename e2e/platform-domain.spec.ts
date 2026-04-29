/**
 * E2E tests for the platform domain landscape diagram.
 * Platform has auth and analytics systems; auth is consumed by all other domains.
 *
 * Run:  npx playwright test --config e2e/playwright.config.ts platform-domain
 */

import { diagramSuite, FULL } from './diagram-helpers';

diagramSuite(
  'platform domain',
  '/c4/default/domain/platform',
  'platform',
  FULL,
);
