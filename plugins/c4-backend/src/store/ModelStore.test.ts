import { TestDatabases } from '@backstage/backend-test-utils';
import { C4Model, C4ViewDescriptor } from '../types';
import { ModelStore } from './ModelStore';

const databases = TestDatabases.create();

function makeModel(overrides: Partial<C4Model> = {}): C4Model {
  return { nodes: [], actors: [], relationships: [], ...overrides };
}

function makeDescriptor(
  overrides: Partial<C4ViewDescriptor> = {},
): C4ViewDescriptor {
  return {
    id: 'view-1',
    title: 'My View',
    subjectId: 'domain:default/my-domain',
    entityRef: 'domain:default/my-domain',
    source: 'catalog',
    ...overrides,
  };
}

describe('ModelStore', () => {
  it('getViewDescriptors returns empty array on fresh DB', async () => {
    const knex = await databases.init('SQLITE_3');
    const store = new ModelStore(knex);
    await store.migrate();
    expect(await store.getViewDescriptors()).toEqual([]);
  });

  it('saveViewDescriptors + getViewDescriptors round-trips descriptors', async () => {
    const knex = await databases.init('SQLITE_3');
    const store = new ModelStore(knex);
    await store.migrate();

    const desc = makeDescriptor();
    await store.saveViewDescriptors([desc], 'catalog');
    const results = await store.getViewDescriptors();
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('view-1');
    expect(results[0].subjectId).toBe('domain:default/my-domain');
    expect(results[0].source).toBe('catalog');
  });

  it('getViewDescriptors filters by entityRef', async () => {
    const knex = await databases.init('SQLITE_3');
    const store = new ModelStore(knex);
    await store.migrate();

    await store.saveViewDescriptors(
      [
        makeDescriptor({
          id: 'v1',
          entityRef: 'domain:default/foo',
          subjectId: 'domain:default/foo',
        }),
        makeDescriptor({
          id: 'v2',
          entityRef: 'domain:default/bar',
          subjectId: 'domain:default/bar',
        }),
      ],
      'catalog',
    );

    const results = await store.getViewDescriptors({
      entityRef: 'domain:default/foo',
    });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('v1');
  });

  it('saveModel persists nodes; computeDiagram returns them', async () => {
    const knex = await databases.init('SQLITE_3');
    const store = new ModelStore(knex);
    await store.migrate();

    const domain = {
      id: 'domain:default/my-domain',
      depth: 0,
      name: 'My Domain',
      description: '',
      tags: [] as string[],
    };
    const system = {
      id: 'system:default/my-system',
      parentId: 'domain:default/my-domain',
      depth: 1,
      name: 'My System',
      description: '',
      tags: [] as string[],
    };
    await store.saveModel(makeModel({ nodes: [domain, system] }), 'catalog');

    const desc = makeDescriptor({ subjectId: 'domain:default/my-domain' });
    await store.saveViewDescriptors([desc], 'catalog');

    const diagram = await store.computeDiagram('view-1');
    expect(diagram).toBeDefined();
    expect(diagram!.nodes.some(n => n.id === 'system:default/my-system')).toBe(
      true,
    );
  });

  it('computeDiagram returns undefined for unknown viewId', async () => {
    const knex = await databases.init('SQLITE_3');
    const store = new ModelStore(knex);
    await store.migrate();
    expect(await store.computeDiagram('not-found')).toBeUndefined();
  });

  it('saveModel clears diagram cache', async () => {
    const knex = await databases.init('SQLITE_3');
    const store = new ModelStore(knex);
    await store.migrate();

    const domain = {
      id: 'domain:default/d1',
      depth: 0,
      name: 'D1',
      description: '',
      tags: [] as string[],
    };
    await store.saveModel(makeModel({ nodes: [domain] }), 'catalog');
    await store.saveViewDescriptors(
      [makeDescriptor({ subjectId: 'domain:default/d1' })],
      'catalog',
    );

    // First compute — populates cache
    const first = await store.computeDiagram('view-1');
    expect(first).toBeDefined();

    // Resave with updated node
    const updated = { ...domain, name: 'D1 Updated' };
    await store.saveModel(makeModel({ nodes: [updated] }), 'catalog');

    // Cache should be cleared
    const second = await store.computeDiagram('view-1');
    expect(second!.nodes.find(n => n.id === 'domain:default/d1')!.name).toBe(
      'D1 Updated',
    );
  });

  it('getSyncStatus returns empty object on fresh DB', async () => {
    const knex = await databases.init('SQLITE_3');
    const store = new ModelStore(knex);
    await store.migrate();
    expect(await store.getSyncStatus()).toEqual({});
  });

  it('updateSyncStatus upserts status per source', async () => {
    const knex = await databases.init('SQLITE_3');
    const store = new ModelStore(knex);
    await store.migrate();

    await store.updateSyncStatus('catalog', 'ok');
    const status = await store.getSyncStatus();
    expect(status.catalog.status).toBe('ok');
    expect(status.catalog.lastSync).not.toBeNull();

    await store.updateSyncStatus('catalog', 'error');
    const status2 = await store.getSyncStatus();
    expect(status2.catalog.status).toBe('error');
  });

  it('saveViewDescriptors replaces previous descriptors for same source', async () => {
    const knex = await databases.init('SQLITE_3');
    const store = new ModelStore(knex);
    await store.migrate();

    await store.saveViewDescriptors(
      [makeDescriptor({ id: 'old-view', subjectId: 'domain:default/d' })],
      'catalog',
    );
    await store.saveViewDescriptors(
      [makeDescriptor({ id: 'new-view', subjectId: 'domain:default/d' })],
      'catalog',
    );

    const results = await store.getViewDescriptors();
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('new-view');
  });

  describe('node positions', () => {
    it('getNodePositions returns empty object when no positions saved', async () => {
      const knex = await databases.init('SQLITE_3');
      const store = new ModelStore(knex);
      await store.migrate();
      expect(await store.getNodePositions('view-1')).toEqual({});
    });

    it('saveNodePositions + getNodePositions round-trips positions', async () => {
      const knex = await databases.init('SQLITE_3');
      const store = new ModelStore(knex);
      await store.migrate();
      await store.saveNodePositions('view-1', {
        'node-a': { x: 100, y: 200 },
        'node-b': { x: 300, y: 400 },
      });
      const positions = await store.getNodePositions('view-1');
      expect(positions['node-a']).toEqual({ x: 100, y: 200 });
      expect(positions['node-b']).toEqual({ x: 300, y: 400 });
    });

    it('saveNodePositions replaces all existing positions for the view', async () => {
      const knex = await databases.init('SQLITE_3');
      const store = new ModelStore(knex);
      await store.migrate();
      await store.saveNodePositions('view-1', { 'node-a': { x: 1, y: 2 } });
      await store.saveNodePositions('view-1', { 'node-b': { x: 3, y: 4 } });
      const positions = await store.getNodePositions('view-1');
      expect(positions['node-a']).toBeUndefined();
      expect(positions['node-b']).toEqual({ x: 3, y: 4 });
    });

    it('clearNodePositions removes all positions for the view', async () => {
      const knex = await databases.init('SQLITE_3');
      const store = new ModelStore(knex);
      await store.migrate();
      await store.saveNodePositions('view-1', { 'node-a': { x: 1, y: 2 } });
      await store.clearNodePositions('view-1');
      expect(await store.getNodePositions('view-1')).toEqual({});
    });

    it('saveNodePositions invalidates the diagram cache', async () => {
      const knex = await databases.init('SQLITE_3');
      const store = new ModelStore(knex);
      await store.migrate();

      const domain = {
        id: 'domain:default/d',
        depth: 0,
        name: 'D',
        description: '',
        tags: [] as string[],
      };
      await store.saveModel(
        { nodes: [domain], actors: [], relationships: [] },
        'catalog',
      );
      await store.saveViewDescriptors(
        [makeDescriptor({ subjectId: 'domain:default/d' })],
        'catalog',
      );

      const first = await store.computeDiagram('view-1');
      expect(first?.nodePositions).toEqual({});

      await store.saveNodePositions('view-1', { 'node-a': { x: 10, y: 20 } });
      const second = await store.computeDiagram('view-1');
      expect(second?.nodePositions['node-a']).toEqual({ x: 10, y: 20 });
    });

    it('saveViewDescriptors clears positions for replaced views', async () => {
      const knex = await databases.init('SQLITE_3');
      const store = new ModelStore(knex);
      await store.migrate();

      await store.saveViewDescriptors([makeDescriptor()], 'catalog');
      await store.saveNodePositions('view-1', { n: { x: 1, y: 2 } });

      // Re-sync replaces the view descriptor
      await store.saveViewDescriptors([makeDescriptor()], 'catalog');
      expect(await store.getNodePositions('view-1')).toEqual({});
    });
  });

  describe('updateViewSettings', () => {
    it('creates settings on first call', async () => {
      const knex = await databases.init('SQLITE_3');
      const store = new ModelStore(knex);
      await store.migrate();
      await store.saveViewDescriptors([makeDescriptor()], 'catalog');

      await store.updateViewSettings('view-1', { direction: 'LR' });

      const descriptors = await store.getViewDescriptors();
      expect(descriptors[0].displaySettings?.direction).toBe('LR');
    });

    it('merges partial patch without wiping existing keys', async () => {
      const knex = await databases.init('SQLITE_3');
      const store = new ModelStore(knex);
      await store.migrate();
      await store.saveViewDescriptors([makeDescriptor()], 'catalog');

      await store.updateViewSettings('view-1', { direction: 'LR' });
      await store.updateViewSettings('view-1', { nodeSep: 120 });

      const descriptors = await store.getViewDescriptors();
      expect(descriptors[0].displaySettings?.direction).toBe('LR');
      expect(descriptors[0].displaySettings?.nodeSep).toBe(120);
    });

    it('overwrites only the patched key on second call', async () => {
      const knex = await databases.init('SQLITE_3');
      const store = new ModelStore(knex);
      await store.migrate();
      await store.saveViewDescriptors([makeDescriptor()], 'catalog');

      await store.updateViewSettings('view-1', {
        direction: 'LR',
        nodeSep: 80,
      });
      await store.updateViewSettings('view-1', { direction: 'TB' });

      const descriptors = await store.getViewDescriptors();
      expect(descriptors[0].displaySettings?.direction).toBe('TB');
      expect(descriptors[0].displaySettings?.nodeSep).toBe(80);
    });

    it('invalidates diagram cache', async () => {
      const knex = await databases.init('SQLITE_3');
      const store = new ModelStore(knex);
      await store.migrate();

      const domain = {
        id: 'domain:default/d',
        depth: 0,
        name: 'D',
        description: '',
        tags: [] as string[],
      };
      await store.saveModel(
        { nodes: [domain], actors: [], relationships: [] },
        'catalog',
      );
      await store.saveViewDescriptors(
        [makeDescriptor({ subjectId: 'domain:default/d' })],
        'catalog',
      );

      const before = await store.computeDiagram('view-1');
      expect(before?.descriptor.displaySettings).toBeUndefined();

      await store.updateViewSettings('view-1', { direction: 'LR' });

      const after = await store.computeDiagram('view-1');
      expect(after?.descriptor.displaySettings?.direction).toBe('LR');
    });
  });

  describe('subcomponent support', () => {
    it('computeDiagram for parent component includes depth-3 subcomponents', async () => {
      const knex = await databases.init('SQLITE_3');
      const store = new ModelStore(knex);
      await store.migrate();

      const system = {
        id: 'system:default/s',
        depth: 1,
        name: 'S',
        description: '',
        navigable: true,
        tags: [] as string[],
      };
      const component = {
        id: 'component:default/payment-service',
        parentId: 'system:default/s',
        depth: 2,
        name: 'Payment Service',
        description: '',
        navigable: true,
        tags: [] as string[],
      };
      const subA = {
        id: 'component:default/gateway-client',
        parentId: 'component:default/payment-service',
        depth: 3,
        name: 'Gateway Client',
        description: '',
        navigable: false,
        tags: [] as string[],
      };
      const subB = {
        id: 'component:default/fraud-checker',
        parentId: 'component:default/payment-service',
        depth: 3,
        name: 'Fraud Checker',
        description: '',
        navigable: false,
        tags: [] as string[],
      };

      await store.saveModel(
        makeModel({ nodes: [system, component, subA, subB] }),
        'catalog',
      );
      await store.saveViewDescriptors(
        [
          makeDescriptor({
            id: 'comp-view',
            subjectId: 'component:default/payment-service',
            entityRef: 'component:default/payment-service',
          }),
        ],
        'catalog',
      );

      const diagram = await store.computeDiagram('comp-view');
      expect(diagram).toBeDefined();
      const nodeIds = diagram!.nodes.map(n => n.id);
      expect(nodeIds).toContain('component:default/gateway-client');
      expect(nodeIds).toContain('component:default/fraud-checker');
    });

    it('getViewDescriptors returns level=component when subject has depth-3 children', async () => {
      const knex = await databases.init('SQLITE_3');
      const store = new ModelStore(knex);
      await store.migrate();

      const component = {
        id: 'component:default/payment-service',
        parentId: 'system:default/s',
        depth: 2,
        name: 'Payment Service',
        description: '',
        navigable: true,
        tags: [] as string[],
      };
      const sub = {
        id: 'component:default/gateway-client',
        parentId: 'component:default/payment-service',
        depth: 3,
        name: 'Gateway Client',
        description: '',
        navigable: false,
        tags: [] as string[],
      };

      await store.saveModel(makeModel({ nodes: [component, sub] }), 'catalog');
      await store.saveViewDescriptors(
        [
          makeDescriptor({
            id: 'comp-view',
            subjectId: 'component:default/payment-service',
            entityRef: 'component:default/payment-service',
          }),
        ],
        'catalog',
      );

      const descriptors = await store.getViewDescriptors();
      expect(descriptors[0].level).toBe('component');
    });

    it('getViewDescriptors returns level=container when subject has no depth-3 children', async () => {
      const knex = await databases.init('SQLITE_3');
      const store = new ModelStore(knex);
      await store.migrate();

      const component = {
        id: 'component:default/api-service',
        parentId: 'system:default/s',
        depth: 2,
        name: 'API Service',
        description: '',
        navigable: true,
        tags: [] as string[],
      };

      await store.saveModel(makeModel({ nodes: [component] }), 'catalog');
      await store.saveViewDescriptors(
        [
          makeDescriptor({
            id: 'api-view',
            subjectId: 'component:default/api-service',
            entityRef: 'component:default/api-service',
          }),
        ],
        'catalog',
      );

      const descriptors = await store.getViewDescriptors();
      expect(descriptors[0].level).toBe('container');
    });
  });

  describe('subdomain support', () => {
    it('computeDiagram for parent domain includes subdomain and its systems', async () => {
      const knex = await databases.init('SQLITE_3');
      const store = new ModelStore(knex);
      await store.migrate();

      const parentDomain = {
        id: 'domain:default/retail',
        depth: 0,
        name: 'Retail',
        description: '',
        navigable: true,
        tags: [] as string[],
      };
      const subdomain = {
        id: 'domain:default/payments',
        parentId: 'domain:default/retail',
        depth: 0,
        name: 'Payments',
        description: '',
        navigable: true,
        tags: [] as string[],
      };
      const directSystem = {
        id: 'system:default/storefront',
        parentId: 'domain:default/retail',
        depth: 1,
        name: 'Storefront',
        description: '',
        navigable: true,
        tags: [] as string[],
      };
      const subdomainSystem = {
        id: 'system:default/payment-processing',
        parentId: 'domain:default/payments',
        depth: 1,
        name: 'Payment Processing',
        description: '',
        navigable: true,
        tags: [] as string[],
      };

      await store.saveModel(
        makeModel({
          nodes: [parentDomain, subdomain, directSystem, subdomainSystem],
        }),
        'catalog',
      );
      await store.saveViewDescriptors(
        [
          makeDescriptor({
            id: 'retail-view',
            subjectId: 'domain:default/retail',
            entityRef: 'domain:default/retail',
          }),
        ],
        'catalog',
      );

      const diagram = await store.computeDiagram('retail-view');
      expect(diagram).toBeDefined();
      const nodeIds = diagram!.nodes.map(n => n.id);
      expect(nodeIds).toContain('domain:default/payments');
      expect(nodeIds).toContain('system:default/storefront');
      expect(nodeIds).toContain('system:default/payment-processing');
    });
  });

  describe('navigable field', () => {
    it('persists navigable=true for domain and system in landscape diagram', async () => {
      const knex = await databases.init('SQLITE_3');
      const store = new ModelStore(knex);
      await store.migrate();

      const domain = {
        id: 'domain:default/d',
        depth: 0,
        name: 'D',
        description: '',
        navigable: true,
        tags: [] as string[],
      };
      const system = {
        id: 'system:default/s',
        parentId: 'domain:default/d',
        depth: 1,
        name: 'S',
        description: '',
        navigable: true,
        tags: [] as string[],
      };

      await store.saveModel(makeModel({ nodes: [domain, system] }), 'catalog');
      await store.saveViewDescriptors(
        [makeDescriptor({ subjectId: 'domain:default/d' })],
        'catalog',
      );

      const diagram = await store.computeDiagram('view-1');
      expect(
        diagram!.nodes.find(n => n.id === 'domain:default/d')!.navigable,
      ).toBe(true);
      expect(
        diagram!.nodes.find(n => n.id === 'system:default/s')!.navigable,
      ).toBe(true);
    });

    it('persists navigable=false for Resource in context diagram', async () => {
      const knex = await databases.init('SQLITE_3');
      const store = new ModelStore(knex);
      await store.migrate();

      const system = {
        id: 'system:default/s',
        parentId: 'domain:default/d',
        depth: 1,
        name: 'S',
        description: '',
        navigable: true,
        tags: [] as string[],
      };
      const resource = {
        id: 'resource:default/r',
        parentId: 'system:default/s',
        depth: 2,
        name: 'R',
        description: '',
        navigable: false,
        subType: 'database' as const,
        tags: [] as string[],
      };

      await store.saveModel(
        makeModel({ nodes: [system, resource] }),
        'catalog',
      );
      await store.saveViewDescriptors(
        [makeDescriptor({ id: 'view-1', subjectId: 'system:default/s' })],
        'catalog',
      );

      const diagram = await store.computeDiagram('view-1');
      const resNode = diagram!.nodes.find(n => n.id === 'resource:default/r');
      expect(resNode).toBeDefined();
      expect(resNode!.navigable).toBe(false);
      expect(resNode!.subType).toBe('database');
    });
  });
});
