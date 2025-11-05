# C4 Backend — Plan 7: Wire Up index.ts

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire all backend pieces together in index.ts — ModelStore, CatalogProcessor, DSLProcessor, router, and TaskScheduler.

**Architecture:** index.ts initializes ModelStore (runs migrations), CatalogProcessor and DSLProcessor, creates router with sync function, registers scheduled tasks via Backstage TaskScheduler. Also adds `database` and `scheduler` to plugin deps. Config read from `c4` key in app-config.yaml.

**Tech Stack:** TypeScript, @backstage/backend-plugin-api, @backstage/catalog-client, @backstage/backend-common.

**Prerequisite:** Plans 1-6 all complete.

---

### Task 1: Replace index.ts skeleton with full implementation

**Files:**
- Modify: `plugins/c4-backend/src/index.ts`

No tests for this task — integration is tested by running the dev server.

- [ ] **Step 1: Replace index.ts**

```typescript
// plugins/c4-backend/src/index.ts
import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { CatalogClient } from '@backstage/catalog-client';
import { ModelStore } from './store/ModelStore';
import { CatalogProcessor } from './processors/CatalogProcessor';
import { DSLProcessor } from './processors/DSLProcessor';
import { createRouter } from './router';

export const c4Plugin = createBackendPlugin({
  pluginId: 'c4',
  register(env) {
    env.registerInit({
      deps: {
        logger: coreServices.logger,
        config: coreServices.rootConfig,
        httpRouter: coreServices.httpRouter,
        database: coreServices.database,
        scheduler: coreServices.scheduler,
        discovery: coreServices.discovery,
        urlReader: coreServices.urlReader,
      },
      async init({ logger, config, httpRouter, database, scheduler, discovery, urlReader }) {
        const db = await database.getClient();
        const store = new ModelStore(db);
        await store.migrate();

        const catalogClient = new CatalogClient({ discoveryApi: discovery });
        const catalogProcessor = new CatalogProcessor(catalogClient);
        const dslProcessor = new DSLProcessor(catalogClient, urlReader);

        const maxSnapshots = config.getOptionalNumber('c4.history.maxSnapshots') ?? 100;
        const historyEnabled = config.getOptionalBoolean('c4.history.enabled') ?? true;

        async function runSync() {
          logger.info('C4 sync started');

          try {
            const catalogModel = await catalogProcessor.process();
            await store.saveModel(catalogModel, 'catalog');
            if (historyEnabled) {
              for (const view of catalogModel.views) {
                const viewModel = await store.getViewModel(view.id);
                await store.saveSnapshot(view.id, viewModel, maxSnapshots);
              }
            }
            await store.updateSyncStatus('catalog', 'ok');
            logger.info('C4 catalog sync complete');
          } catch (err) {
            await store.updateSyncStatus('catalog', 'error');
            logger.error('C4 catalog sync failed', err as Error);
          }

          try {
            const dslModel = await dslProcessor.process();
            await store.saveModel(dslModel, 'dsl');
            if (historyEnabled) {
              for (const view of dslModel.views) {
                const viewModel = await store.getViewModel(view.id);
                await store.saveSnapshot(view.id, viewModel, maxSnapshots);
              }
            }
            await store.updateSyncStatus('dsl', 'ok');
            logger.info('C4 DSL sync complete');
          } catch (err) {
            await store.updateSyncStatus('dsl', 'error');
            logger.error('C4 DSL sync failed', err as Error);
          }
        }

        const router = await createRouter({ store, syncFn: runSync });
        httpRouter.use(router);

        const frequency = config.getOptionalNumber('c4.schedule.frequency.minutes') ?? 5;
        const timeout = config.getOptionalNumber('c4.schedule.timeout.minutes') ?? 3;

        await scheduler.scheduleTask({
          id: 'c4-sync',
          frequency: { minutes: frequency },
          timeout: { minutes: timeout },
          fn: runSync,
        });

        logger.info('C4 backend plugin initialized');
      },
    });
  },
});

export default c4Plugin;
```

- [ ] **Step 2: Add database + scheduler to plugin deps in app-config.yaml**

Add C4 config block to `app-config.yaml` (after the `catalog:` section):

```yaml
c4:
  schedule:
    frequency:
      minutes: 5
    timeout:
      minutes: 3
  dsl:
    annotation: fulgas.io/c4-model
    conventionPath: c4-model.dsl
  history:
    enabled: true
    maxSnapshots: 100
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `yarn workspace @fulgas/plugin-c4-backend tsc --noEmit`

Expected: no errors.

- [ ] **Step 4: Start dev server and verify C4 backend starts**

Run: `yarn start-backend`

Expected in logs:
```
info: C4 backend plugin initialized
```

Navigate to `http://localhost:7007/api/c4/health` — expected:
```json
{"status":"ok","lastSync":null,"processorStatus":{"catalog":"ok","dsl":"ok"}}
```

After ~5 minutes (or trigger `POST http://localhost:7007/api/c4/sync`), navigate to `http://localhost:7007/api/c4/views` — expected: array of views from catalog.
