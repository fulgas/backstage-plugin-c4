/**
 * E2E tests for the external-services domain diagram.
 * Contains third-party SaaS APIs (Stripe, DHL, Okta) consumed by internal systems.
 *
 * Run:  npx playwright test --config e2e/playwright.config.ts domain-external-services
 */

import { diagramSuite, SCREENSHOT_ONLY } from './diagram-helpers';

// external-services domain has no internal nodes — just external SaaS APIs.
diagramSuite(
  'external-services domain',
  '/c4/default/domain/external-services',
  'domain-external-services',
  SCREENSHOT_ONLY,
);
