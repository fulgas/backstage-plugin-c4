/**
 * E2E tests for the external-services system context diagram.
 * Stripe, DHL, Okta and other external SaaS dependencies.
 *
 * Run:  npx playwright test --config e2e/playwright.config.ts system-external-services
 */

import { diagramSuite, SCREENSHOT_ONLY } from './diagram-helpers';

// external-services system has no internal components defined — renders no nodes.
diagramSuite(
  'external-services system',
  '/c4/default/system/external-services',
  'system-external-services',
  SCREENSHOT_ONLY,
);
