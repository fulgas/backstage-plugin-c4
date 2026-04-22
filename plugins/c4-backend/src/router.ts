import type {
  AuditorService,
  CacheService,
  HttpAuthService,
  PermissionsService,
} from '@backstage/backend-plugin-api';
import { NotFoundError } from '@backstage/errors';
import {
  AuthorizeResult,
  type Permission,
} from '@backstage/plugin-permission-common';
import express, { Request, Response, Router } from 'express';
import {
  c4DiagramReadPermission,
  c4SyncTriggerPermission,
} from './permissions';
import { ModelStore } from './store/ModelStore';
import type { C4Diagram } from './types';

interface RouterOptions {
  store: ModelStore;
  syncFn: () => Promise<void>;
  cache?: CacheService;
  auditor?: AuditorService;
  permissions?: PermissionsService;
  httpAuth?: HttpAuthService;
}

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function cacheKey(viewId: string): string {
  return `diagram:${viewId}`;
}

async function isAllowed(
  permission: Permission,
  req: Request,
  opts: Pick<RouterOptions, 'permissions' | 'httpAuth'>,
): Promise<boolean> {
  if (!opts.permissions || !opts.httpAuth) return true;
  const credentials = await opts.httpAuth.credentials(req);
  const [decision] = await opts.permissions.authorize([{ permission } as any], {
    credentials,
  });
  return decision.result !== AuthorizeResult.DENY;
}

let syncInProgress = false;

function triggerSyncOnce(syncFn: () => Promise<void>) {
  if (syncInProgress) return;
  syncInProgress = true;
  Promise.resolve(syncFn()).finally(() => {
    syncInProgress = false;
  });
}

export async function createRouter(options: RouterOptions): Promise<Router> {
  const { store, syncFn, cache, auditor, permissions, httpAuth } = options;
  const router = Router();
  router.use(express.json());

  router.get('/views', async (_req: Request, res: Response, next) => {
    try {
      const descriptors = await store.getViewDescriptors();
      if (descriptors.length === 0) {
        triggerSyncOnce(syncFn);
        res.status(202).json({ building: true });
        return;
      }
      res.json(descriptors);
    } catch (err) {
      next(err);
    }
  });

  router.get('/views/:id', async (req: Request, res: Response, next) => {
    try {
      if (
        !(await isAllowed(c4DiagramReadPermission, req, {
          permissions,
          httpAuth,
        }))
      ) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      const { id } = req.params;

      const cached = (await cache?.get<any>(cacheKey(id))) as
        | C4Diagram
        | undefined;
      if (cached) {
        res.json(cached);
        return;
      }

      const event = await auditor?.createEvent({
        eventId: 'diagram-view',
        severityLevel: 'low',
      });
      const diagram = await store.computeDiagram(id);
      if (!diagram) {
        await event?.fail({ error: new Error(`View ${id} not found`) });
        throw new NotFoundError(`View ${id} not found`);
      }
      await cache?.set(cacheKey(id), diagram as any, { ttl: CACHE_TTL_MS });
      await event?.success({ meta: { viewId: id } });
      res.json(diagram);
    } catch (err) {
      next(err);
    }
  });

  router.get(
    '/entity/:kind/:namespace/:name/views',
    async (req: Request, res: Response, next) => {
      try {
        const allDescriptors = await store.getViewDescriptors();
        if (allDescriptors.length === 0) {
          triggerSyncOnce(syncFn);
          res.status(202).json({ building: true });
          return;
        }
        const { kind, namespace, name } = req.params;
        const descriptors = await store.getViewDescriptors({
          entityRef: `${kind}:${namespace}/${name}`,
        });
        res.json(descriptors);
      } catch (err) {
        next(err);
      }
    },
  );

  router.patch(
    '/views/:id/settings',
    async (req: Request, res: Response, next) => {
      try {
        const { id } = req.params;
        const { direction, nodeSep, rankSep } = req.body ?? {};
        await store.updateViewSettings(id, { direction, nodeSep, rankSep });
        await cache?.delete(cacheKey(id));
        res.json({ status: 'ok' });
      } catch (err) {
        next(err);
      }
    },
  );

  router.put(
    '/views/:id/positions',
    async (req: Request, res: Response, next) => {
      try {
        const { id } = req.params;
        const positions = req.body?.positions ?? {};
        await store.saveNodePositions(id, positions);
        await cache?.delete(cacheKey(id));
        res.json({ status: 'ok' });
      } catch (err) {
        next(err);
      }
    },
  );

  router.delete(
    '/views/:id/positions',
    async (req: Request, res: Response, next) => {
      try {
        const { id } = req.params;
        await store.clearNodePositions(id);
        await cache?.delete(cacheKey(id));
        res.json({ status: 'ok' });
      } catch (err) {
        next(err);
      }
    },
  );

  router.post('/sync', async (req: Request, res: Response, next) => {
    try {
      if (
        !(await isAllowed(c4SyncTriggerPermission, req, {
          permissions,
          httpAuth,
        }))
      ) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      const event = await auditor?.createEvent({
        eventId: 'sync-trigger',
        severityLevel: 'medium',
      });
      syncFn().catch(() => {});
      await event?.success();
      res.json({ status: 'started' });
    } catch (err) {
      next(err);
    }
  });

  router.get('/health', async (_req: Request, res: Response, next) => {
    try {
      const syncStatus = await store.getSyncStatus();
      res.json({ status: 'ok', syncStatus });
    } catch (err) {
      next(err);
    }
  });

  router.use((err: Error, _req: Request, res: Response, _next: any) => {
    if (err.name === 'NotFoundError')
      res.status(404).json({ error: err.message });
    else res.status(500).json({ error: err.message });
  });

  return router;
}
