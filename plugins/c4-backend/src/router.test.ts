import express from 'express';
import request from 'supertest';
import { createRouter } from './router';
import { ModelStore } from './store/ModelStore';
import { C4Diagram, C4ViewDescriptor } from './types';

function mockStore(
  overrides: Partial<ModelStore> = {},
): jest.Mocked<ModelStore> {
  return {
    getViewDescriptors: jest.fn().mockResolvedValue([]),
    getViewDescriptor: jest.fn().mockResolvedValue(undefined),
    computeDiagram: jest.fn().mockResolvedValue(undefined),
    saveModel: jest.fn().mockResolvedValue(undefined),
    saveViewDescriptors: jest.fn().mockResolvedValue(undefined),
    updateSyncStatus: jest.fn().mockResolvedValue(undefined),
    getSyncStatus: jest.fn().mockResolvedValue({}),
    migrate: jest.fn().mockResolvedValue(undefined),
    saveNodePositions: jest.fn().mockResolvedValue(undefined),
    clearNodePositions: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as jest.Mocked<ModelStore>;
}

const sampleDescriptor: C4ViewDescriptor = {
  id: 'view-1',
  title: 'My Domain',
  subjectId: 'domain:default/my-domain',
  entityRef: 'domain:default/my-domain',
  source: 'catalog',
};

const sampleDiagram: C4Diagram = {
  descriptor: sampleDescriptor,
  nodes: [
    {
      id: 'domain:default/my-domain',
      depth: 0,
      name: 'My Domain',
      description: '',
      tags: [],
    },
  ],
  actors: [],
  relationships: [],
  nodePositions: {},
};

describe('GET /views', () => {
  it('returns 202 building when no descriptors', async () => {
    const app = express();
    app.use(await createRouter({ store: mockStore(), syncFn: jest.fn() }));
    const res = await request(app).get('/views');
    expect(res.status).toBe(202);
    expect(res.body.building).toBe(true);
  });

  it('returns descriptors from store', async () => {
    const app = express();
    app.use(
      await createRouter({
        store: mockStore({
          getViewDescriptors: jest.fn().mockResolvedValue([sampleDescriptor]),
        }),
        syncFn: jest.fn(),
      }),
    );
    const res = await request(app).get('/views');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe('view-1');
  });
});

describe('GET /views/:id', () => {
  it('returns 404 when view not found', async () => {
    const app = express();
    app.use(await createRouter({ store: mockStore(), syncFn: jest.fn() }));
    const res = await request(app).get('/views/missing');
    expect(res.status).toBe(404);
  });

  it('returns diagram when found', async () => {
    const app = express();
    app.use(
      await createRouter({
        store: mockStore({
          computeDiagram: jest.fn().mockResolvedValue(sampleDiagram),
        }),
        syncFn: jest.fn(),
      }),
    );
    const res = await request(app).get('/views/view-1');
    expect(res.status).toBe(200);
    expect(res.body.descriptor.id).toBe('view-1');
    expect(res.body.nodes).toBeDefined();
  });
});

describe('GET /entity/:kind/:namespace/:name/views', () => {
  it('returns 202 when no descriptors yet', async () => {
    const app = express();
    app.use(await createRouter({ store: mockStore(), syncFn: jest.fn() }));
    const res = await request(app).get(
      '/entity/system/default/my-system/views',
    );
    expect(res.status).toBe(202);
  });

  it('returns descriptors for entity', async () => {
    const getViewDescriptors = jest
      .fn()
      .mockResolvedValueOnce([sampleDescriptor]) // allDescriptors check
      .mockResolvedValueOnce([sampleDescriptor]); // entity-specific
    const app = express();
    app.use(
      await createRouter({
        store: mockStore({ getViewDescriptors }),
        syncFn: jest.fn(),
      }),
    );
    const res = await request(app).get(
      '/entity/domain/default/my-domain/views',
    );
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});

describe('POST /sync', () => {
  it('calls syncFn and returns started', async () => {
    const syncFn = jest.fn().mockResolvedValue(undefined);
    const app = express();
    app.use(await createRouter({ store: mockStore(), syncFn }));
    const res = await request(app).post('/sync');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('started');
  });
});

describe('GET /health', () => {
  it('returns health status', async () => {
    const app = express();
    app.use(await createRouter({ store: mockStore(), syncFn: jest.fn() }));
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.syncStatus).toBeDefined();
  });
});

describe('PUT /views/:id/positions', () => {
  it('saves positions and returns ok', async () => {
    const store = mockStore();
    const app = express();
    app.use(await createRouter({ store, syncFn: jest.fn() }));
    const res = await request(app)
      .put('/views/view-1/positions')
      .send({ positions: { 'node-a': { x: 10, y: 20 } } });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(store.saveNodePositions).toHaveBeenCalledWith('view-1', {
      'node-a': { x: 10, y: 20 },
    });
  });
});

describe('DELETE /views/:id/positions', () => {
  it('clears positions and returns ok', async () => {
    const store = mockStore();
    const app = express();
    app.use(await createRouter({ store, syncFn: jest.fn() }));
    const res = await request(app).delete('/views/view-1/positions');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(store.clearNodePositions).toHaveBeenCalledWith('view-1');
  });
});
