# C4 Backend — Plan 6: Router

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Express router with all 8 REST API endpoints.

**Architecture:** Router takes a ModelStore instance. All endpoints read from the DB — no processing logic. Diff endpoint computes added/removed/changed by comparing two snapshots' C4Models.

**Tech Stack:** TypeScript, Express (Router from express), @backstage/errors (NotFoundError).

**Prerequisite:** Plans 1-3 complete (types.ts + ModelStore).

---

### Task 1: Router with TDD

**Files:**
- Create: `plugins/c4-backend/src/router.ts`
- Create: `plugins/c4-backend/src/router.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// plugins/c4-backend/src/router.test.ts
import express from 'express';
import request from 'supertest';
import { createRouter } from './router';
import { ModelStore } from './store/ModelStore';
import { C4Model, C4View, C4Snapshot } from './types';

function mockStore(overrides: Partial<ModelStore> = {}): jest.Mocked<ModelStore> {
  return {
    getViews: jest.fn().mockResolvedValue([]),
    getView: jest.fn().mockResolvedValue(undefined),
    getViewModel: jest.fn().mockResolvedValue({
      persons: [], systems: [], containers: [], components: [], relationships: [], views: [],
    }),
    getEntityViews: jest.fn().mockResolvedValue([]),
    saveSnapshot: jest.fn().mockResolvedValue(undefined),
    getSnapshots: jest.fn().mockResolvedValue([]),
    getSnapshot: jest.fn().mockResolvedValue(undefined),
    updateSyncStatus: jest.fn().mockResolvedValue(undefined),
    getSyncStatus: jest.fn().mockResolvedValue({
      lastCatalogSync: null,
      lastDslSync: null,
      catalogStatus: 'ok',
      dslStatus: 'ok',
    }),
    saveModel: jest.fn().mockResolvedValue(undefined),
    migrate: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as jest.Mocked<ModelStore>;
}

const sampleView: C4View = {
  id: 'view-1',
  type: 'landscape',
  title: 'Landscape',
  entityRefs: [],
  relationshipIds: [],
  source: 'catalog',
};

describe('GET /views', () => {
  it('returns empty array when no views', async () => {
    const store = mockStore();
    const app = express();
    app.use(await createRouter({ store, syncFn: jest.fn() }));
    const res = await request(app).get('/views');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns views from store', async () => {
    const store = mockStore({ getViews: jest.fn().mockResolvedValue([sampleView]) });
    const app = express();
    app.use(await createRouter({ store, syncFn: jest.fn() }));
    const res = await request(app).get('/views');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe('view-1');
  });

  it('passes level query param to store', async () => {
    const getViews = jest.fn().mockResolvedValue([]);
    const store = mockStore({ getViews });
    const app = express();
    app.use(await createRouter({ store, syncFn: jest.fn() }));
    await request(app).get('/views?level=landscape');
    expect(getViews).toHaveBeenCalledWith({ type: 'landscape' });
  });
});

describe('GET /views/:id', () => {
  it('returns 404 when view not found', async () => {
    const store = mockStore({ getView: jest.fn().mockResolvedValue(undefined) });
    const app = express();
    app.use(await createRouter({ store, syncFn: jest.fn() }));
    const res = await request(app).get('/views/missing');
    expect(res.status).toBe(404);
  });

  it('returns view and model when found', async () => {
    const store = mockStore({
      getView: jest.fn().mockResolvedValue(sampleView),
      getViewModel: jest.fn().mockResolvedValue({ persons: [], systems: [], containers: [], components: [], relationships: [], views: [] }),
    });
    const app = express();
    app.use(await createRouter({ store, syncFn: jest.fn() }));
    const res = await request(app).get('/views/view-1');
    expect(res.status).toBe(200);
    expect(res.body.view.id).toBe('view-1');
    expect(res.body.model).toBeDefined();
  });
});

describe('GET /entity/:kind/:namespace/:name/views', () => {
  it('returns views for entity', async () => {
    const store = mockStore({ getEntityViews: jest.fn().mockResolvedValue([sampleView]) });
    const app = express();
    app.use(await createRouter({ store, syncFn: jest.fn() }));
    const res = await request(app).get('/entity/system/default/my-system/views');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(store.getEntityViews).toHaveBeenCalledWith('system:default/my-system');
  });
});

describe('GET /landscape', () => {
  it('returns 404 when no landscape view', async () => {
    const store = mockStore({ getViews: jest.fn().mockResolvedValue([]) });
    const app = express();
    app.use(await createRouter({ store, syncFn: jest.fn() }));
    const res = await request(app).get('/landscape');
    expect(res.status).toBe(404);
  });

  it('returns landscape view and model', async () => {
    const store = mockStore({
      getViews: jest.fn().mockResolvedValue([sampleView]),
      getViewModel: jest.fn().mockResolvedValue({ persons: [], systems: [], containers: [], components: [], relationships: [], views: [] }),
    });
    const app = express();
    app.use(await createRouter({ store, syncFn: jest.fn() }));
    const res = await request(app).get('/landscape');
    expect(res.status).toBe(200);
    expect(res.body.view).toBeDefined();
  });
});

describe('GET /views/:id/history', () => {
  it('returns snapshot history', async () => {
    const snapshots = [{ id: 's1', viewId: 'view-1', modelHash: 'abc', createdAt: '2026-01-01' }];
    const store = mockStore({ getSnapshots: jest.fn().mockResolvedValue(snapshots) });
    const app = express();
    app.use(await createRouter({ store, syncFn: jest.fn() }));
    const res = await request(app).get('/views/view-1/history');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});

describe('GET /views/:id/diff', () => {
  it('returns 400 when from or to missing', async () => {
    const store = mockStore();
    const app = express();
    app.use(await createRouter({ store, syncFn: jest.fn() }));
    const res = await request(app).get('/views/view-1/diff');
    expect(res.status).toBe(400);
  });

  it('returns diff between two snapshots', async () => {
    const modelA: C4Model = { persons: [], systems: [{ id: 's1', name: 'Old', description: '', tags: [] }], containers: [], components: [], relationships: [], views: [] };
    const modelB: C4Model = { persons: [], systems: [{ id: 's2', name: 'New', description: '', tags: [] }], containers: [], components: [], relationships: [], views: [] };
    const store = mockStore({
      getSnapshot: jest.fn()
        .mockResolvedValueOnce({ id: 'snap-a', viewId: 'v1', modelHash: 'a', data: JSON.stringify(modelA), createdAt: '2026-01-01' })
        .mockResolvedValueOnce({ id: 'snap-b', viewId: 'v1', modelHash: 'b', data: JSON.stringify(modelB), createdAt: '2026-01-02' }),
    });
    const app = express();
    app.use(await createRouter({ store, syncFn: jest.fn() }));
    const res = await request(app).get('/views/view-1/diff?from=snap-a&to=snap-b');
    expect(res.status).toBe(200);
    expect(res.body.added).toBeDefined();
    expect(res.body.removed).toBeDefined();
    expect(res.body.changed).toBeDefined();
  });
});

describe('POST /sync', () => {
  it('calls syncFn and returns started', async () => {
    const syncFn = jest.fn().mockResolvedValue(undefined);
    const store = mockStore();
    const app = express();
    app.use(await createRouter({ store, syncFn }));
    const res = await request(app).post('/sync');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('started');
  });
});

describe('GET /health', () => {
  it('returns health status', async () => {
    const store = mockStore();
    const app = express();
    app.use(await createRouter({ store, syncFn: jest.fn() }));
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.processorStatus).toBeDefined();
  });
});
```

- [ ] **Step 2: Add supertest dev dep**

In `plugins/c4-backend/package.json` `devDependencies`:
```json
"supertest": "^6.0.0",
"@types/supertest": "^2.0.0"
```

Run: `yarn install`

- [ ] **Step 3: Run tests to verify they fail**

Run: `yarn workspace @fulgas/plugin-c4-backend test --testPathPattern=router --no-coverage`

Expected: FAIL — `Cannot find module './router'`

- [ ] **Step 4: Implement router**

```typescript
// plugins/c4-backend/src/router.ts
import { NotFoundError } from '@backstage/errors';
import express, { Request, Response, Router } from 'express';
import { C4Model } from './types';
import { ModelStore } from './store/ModelStore';

interface RouterOptions {
  store: ModelStore;
  syncFn: () => Promise<void>;
}

export async function createRouter(options: RouterOptions): Promise<Router> {
  const { store, syncFn } = options;
  const router = Router();
  router.use(express.json());

  // GET /views
  router.get('/views', async (req: Request, res: Response) => {
    const level = req.query.level as string | undefined;
    const domain = req.query.domain as string | undefined;
    const views = await store.getViews({
      type: level as any,
      entityRef: domain,
    });
    res.json(views);
  });

  // GET /landscape
  router.get('/landscape', async (_req: Request, res: Response) => {
    const views = await store.getViews({ type: 'landscape' });
    if (views.length === 0) {
      throw new NotFoundError('No landscape view found');
    }
    const view = views[0];
    const model = await store.getViewModel(view.id);
    res.json({ view, model });
  });

  // GET /views/:id/history
  router.get('/views/:id/history', async (req: Request, res: Response) => {
    const snapshots = await store.getSnapshots(req.params.id);
    res.json(snapshots);
  });

  // GET /views/:id/diff
  router.get('/views/:id/diff', async (req: Request, res: Response) => {
    const { from, to } = req.query;
    if (!from || !to) {
      res.status(400).json({ error: 'Query params from and to are required' });
      return;
    }
    const snapA = await store.getSnapshot(from as string);
    const snapB = await store.getSnapshot(to as string);
    if (!snapA || !snapB) {
      throw new NotFoundError('One or both snapshots not found');
    }
    const modelA: C4Model = JSON.parse(snapA.data);
    const modelB: C4Model = JSON.parse(snapB.data);
    res.json(diffModels(modelA, modelB));
  });

  // GET /views/:id
  router.get('/views/:id', async (req: Request, res: Response) => {
    const view = await store.getView(req.params.id);
    if (!view) {
      throw new NotFoundError(`View ${req.params.id} not found`);
    }
    const model = await store.getViewModel(req.params.id);
    res.json({ view, model });
  });

  // GET /entity/:kind/:namespace/:name/views
  router.get('/entity/:kind/:namespace/:name/views', async (req: Request, res: Response) => {
    const { kind, namespace, name } = req.params;
    const entityRef = `${kind}:${namespace}/${name}`;
    const views = await store.getEntityViews(entityRef);
    res.json(views);
  });

  // POST /sync
  router.post('/sync', async (_req: Request, res: Response) => {
    syncFn().catch(() => {}); // fire and forget
    res.json({ status: 'started' });
  });

  // GET /health
  router.get('/health', async (_req: Request, res: Response) => {
    const syncStatus = await store.getSyncStatus();
    res.json({
      status: 'ok',
      lastSync: syncStatus.lastCatalogSync,
      processorStatus: {
        catalog: syncStatus.catalogStatus,
        dsl: syncStatus.dslStatus,
      },
    });
  });

  // Error handler
  router.use((err: Error, _req: Request, res: Response, _next: any) => {
    if (err.name === 'NotFoundError') {
      res.status(404).json({ error: err.message });
    } else {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

function diffModels(
  a: C4Model,
  b: C4Model,
): { added: Partial<C4Model>; removed: Partial<C4Model>; changed: Partial<C4Model> } {
  const aSystemIds = new Set(a.systems.map(s => s.id));
  const bSystemIds = new Set(b.systems.map(s => s.id));

  return {
    added: {
      systems: b.systems.filter(s => !aSystemIds.has(s.id)),
      containers: b.containers.filter(c => !a.containers.find(x => x.id === c.id)),
      components: b.components.filter(c => !a.components.find(x => x.id === c.id)),
      relationships: b.relationships.filter(r => !a.relationships.find(x => x.id === r.id)),
      persons: b.persons.filter(p => !a.persons.find(x => x.id === p.id)),
    },
    removed: {
      systems: a.systems.filter(s => !bSystemIds.has(s.id)),
      containers: a.containers.filter(c => !b.containers.find(x => x.id === c.id)),
      components: a.components.filter(c => !b.components.find(x => x.id === c.id)),
      relationships: a.relationships.filter(r => !b.relationships.find(x => x.id === r.id)),
      persons: a.persons.filter(p => !b.persons.find(x => x.id === p.id)),
    },
    changed: {
      systems: b.systems.filter(s => {
        const old = a.systems.find(x => x.id === s.id);
        return old && JSON.stringify(old) !== JSON.stringify(s);
      }),
    },
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `yarn workspace @fulgas/plugin-c4-backend test --testPathPattern=router --no-coverage`

Expected: all 12 tests PASS.
