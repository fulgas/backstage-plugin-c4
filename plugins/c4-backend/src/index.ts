import {
  coreServices,
  createBackendPlugin,
  createExtensionPoint,
} from '@backstage/backend-plugin-api';
import { CatalogClient } from '@backstage/catalog-client';
import { ModelStore } from './store/ModelStore';
import { CatalogProcessor } from './processors/CatalogProcessor';
import { createRouter } from './router';
import { C4Model, C4ViewDescriptor } from './types';

/**
 * A sync provider that contributes C4 model data and view descriptors.
 *
 * Register providers via `c4ModelProviderExtensionPoint`. Each provider is
 * called on every sync cycle and its output is merged into the store under
 * the provider's `id` (which acts as the `source` key in the DB).
 *
 * @example
 * ```ts
 * extensionPoint.addProvider({
 *   id: 'my-source',
 *   async process() {
 *     const nodes = await fetchNodes();
 *     const descriptors = nodes.map(n => ({ id: n.id, title: n.name, subjectId: n.id, source: 'my-source' }));
 *     return { model: { nodes, actors: [], relationships: [] }, descriptors };
 *   },
 * });
 * ```
 */
export interface C4ModelProvider {
  readonly id: string;
  process(): Promise<{ model: C4Model; descriptors: C4ViewDescriptor[] }>;
}

/**
 * Extension point for registering additional C4 model providers.
 *
 * Use this in a `createBackendModule` to contribute model data from sources
 * other than the Backstage catalog (e.g. Structurizr DSL files, OpenAPI specs).
 *
 * @see C4ModelProvider
 */
export interface C4ModelProviderRegistry {
  addProvider(provider: C4ModelProvider): void;
}

export const c4ModelProviderExtensionPoint =
  createExtensionPoint<C4ModelProviderRegistry>({
    id: 'c4.model-provider',
  });

export const c4Plugin = createBackendPlugin({
  pluginId: 'c4',
  register(env) {
    const providers: C4ModelProvider[] = [];

    env.registerExtensionPoint(c4ModelProviderExtensionPoint, {
      addProvider(provider: C4ModelProvider) {
        providers.push(provider);
      },
    });

    env.registerInit({
      deps: {
        logger: coreServices.logger,
        httpRouter: coreServices.httpRouter,
        database: coreServices.database,
        discovery: coreServices.discovery,
        auth: coreServices.auth,
        scheduler: coreServices.scheduler,
        config: coreServices.rootConfig,
      },
      async init({ logger, httpRouter, database, discovery, auth, scheduler, config }) {
        const db = await database.getClient();
        const store = new ModelStore(db);
        await store.migrate();

        const catalogClient = new CatalogClient({ discoveryApi: discovery });
        const catalogProcessor = new CatalogProcessor(catalogClient, auth);

        async function runSync() {
          logger.info('C4 sync started');

          try {
            const { model, descriptors } = await catalogProcessor.process();
            await store.saveModel(model, 'catalog');
            await store.saveViewDescriptors(descriptors, 'catalog');
            await store.updateSyncStatus('catalog', 'ok');
            logger.info('C4 catalog sync complete');
          } catch (err) {
            await store.updateSyncStatus('catalog', 'error');
            logger.error('C4 catalog sync failed', err as Error);
          }

          for (const provider of providers) {
            try {
              const { model, descriptors } = await provider.process();
              await store.saveModel(model, provider.id);
              await store.saveViewDescriptors(descriptors, provider.id);
              await store.updateSyncStatus(provider.id, 'ok');
              logger.info(`C4 provider "${provider.id}" sync complete`);
            } catch (err) {
              await store.updateSyncStatus(provider.id, 'error');
              logger.error(`C4 provider "${provider.id}" sync failed`, err as Error);
            }
          }
        }

        const router = await createRouter({ store, syncFn: runSync });
        // Cast required: two incompatible copies of @types/express exist in the dep
        // tree (@backstage/backend-plugin-api pulls its own via @types/passport).
        // At runtime these are identical — the cast is safe.
        httpRouter.use(router as any);
        httpRouter.addAuthPolicy({ path: '/views', allow: 'unauthenticated' });
        httpRouter.addAuthPolicy({ path: '/views/:id', allow: 'unauthenticated' });
        httpRouter.addAuthPolicy({ path: '/entity/:kind/:namespace/:name/views', allow: 'unauthenticated' });
        httpRouter.addAuthPolicy({ path: '/health', allow: 'unauthenticated' });
        httpRouter.addAuthPolicy({ path: '/sync', allow: 'unauthenticated' });

        const syncFreqMinutes = config.getOptionalNumber('c4.schedule.frequency.minutes') ?? 15;
        const syncTimeoutMinutes = config.getOptionalNumber('c4.schedule.timeout.minutes') ?? 5;
        const syncInitialDelaySeconds = config.getOptionalNumber('c4.schedule.initialDelay.seconds') ?? 15;

        await scheduler.scheduleTask({
          id: 'c4-sync',
          frequency: { minutes: syncFreqMinutes },
          timeout: { minutes: syncTimeoutMinutes },
          initialDelay: { seconds: syncInitialDelaySeconds },
          fn: runSync,
        });

        logger.info(`C4 backend plugin initialized — syncing every ${syncFreqMinutes} minutes`);
      },
    });
  },
});

export default c4Plugin;
