/**
 * E2E tests for the retail domain landscape diagram.
 * Retail has a payments subdomain (compound), external nodes, and cross-domain edges.
 *
 * Run:  npx playwright test --config e2e/playwright.config.ts retail-landscape
 */

import { diagramSuite, FULL } from './diagram-helpers';

// Standard validations: render, no-passthrough, face-connect, handles, screenshots
diagramSuite('retail landscape', '/c4/default/domain/retail', 'retail', FULL);
