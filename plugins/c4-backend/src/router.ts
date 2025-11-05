import { NotFoundError } from '@backstage/errors';
import express, { Request, Response, Router } from 'express';
import { ModelStore } from './store/ModelStore';

interface RouterOptions {
  store: ModelStore;
  syncFn: () => Promise<void>;
}

let syncInProgress = false;

function triggerSyncOnce(syncFn: () => Promise<void>) {
  if (syncInProgress) return;
  syncInProgress = true;
  Promise.resolve(syncFn()).finally(() => { syncInProgress = false; });
}

export async function createRouter(options: RouterOptions): Promise<Router> {
  const { store, syncFn } = options;
  const router = Router();
  router.use(express.json());

  router.get('/views', async (req: Request, res: Response, next) => {
    try {
      const descriptors = await store.getViewDescriptors();
      if (descriptors.length === 0) {
        triggerSyncOnce(syncFn);
        res.status(202).json({ building: true });
        return;
      }
      res.json(descriptors);
    } catch (err) { next(err); }
  });

  router.get('/views/:id', async (req: Request, res: Response, next) => {
    try {
      const diagram = await store.computeDiagram(req.params.id);
      if (!diagram) throw new NotFoundError(`View ${req.params.id} not found`);
      res.json(diagram);
    } catch (err) { next(err); }
  });

  router.get('/entity/:kind/:namespace/:name/views', async (req: Request, res: Response, next) => {
    try {
      const allDescriptors = await store.getViewDescriptors();
      if (allDescriptors.length === 0) {
        triggerSyncOnce(syncFn);
        res.status(202).json({ building: true });
        return;
      }
      const { kind, namespace, name } = req.params;
      const descriptors = await store.getViewDescriptors({ entityRef: `${kind}:${namespace}/${name}` });
      res.json(descriptors);
    } catch (err) { next(err); }
  });

  router.post('/sync', async (_req: Request, res: Response, next) => {
    try {
      syncFn().catch(() => {});
      res.json({ status: 'started' });
    } catch (err) { next(err); }
  });

  router.get('/health', async (_req: Request, res: Response, next) => {
    try {
      const syncStatus = await store.getSyncStatus();
      res.json({ status: 'ok', syncStatus });
    } catch (err) { next(err); }
  });

  router.use((err: Error, _req: Request, res: Response, _next: any) => {
    if (err.name === 'NotFoundError') res.status(404).json({ error: err.message });
    else res.status(500).json({ error: err.message });
  });

  return router;
}
