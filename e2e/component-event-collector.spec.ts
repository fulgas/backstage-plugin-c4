/**
 * E2E tests for the event-collector component context diagram.
 *
 * Run:  npx playwright test --config e2e/playwright.config.ts component-event-collector
 */

import { diagramSuite, FULL } from './diagram-helpers';

diagramSuite(
  'event-collector component',
  '/c4/default/component/event-collector',
  'component-event-collector',
  FULL,
);
