/**
 * E2E tests for the payments subdomain diagram.
 * Payments is a subdomain of retail with subcomponents (payment-gateway-client, fraud-checker).
 *
 * Run:  npx playwright test --config e2e/playwright.config.ts payments-capture
 */

import { diagramSuite, FULL } from './diagram-helpers';

// Standard validations: render, no-passthrough, face-connect, handles, screenshots
diagramSuite(
  'payments domain',
  '/c4/default/domain/payments',
  'payments',
  FULL,
);
