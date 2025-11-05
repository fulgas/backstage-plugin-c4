import { TestDatabases } from '@backstage/backend-test-utils';
import { ModelStore } from './ModelStore';
import { C4Model, C4ViewDescriptor } from '../types';

const databases = TestDatabases.create();

function makeModel(overrides: Partial<C4Model> = {}): C4Model {
  return { nodes: [], actors: [], relationships: [], ...overrides };
}

function makeDescriptor(overrides: Partial<C4ViewDescriptor> = {}): C4ViewDescriptor {
  return { id: 'view-1', title: 'My View', subjectId: 'domain:default/my-domain', entityRef: 'domain:default/my-domain', source: 'catalog', ...overrides };
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

    await store.saveViewDescriptors([
      makeDescriptor({ id: 'v1', entityRef: 'domain:default/foo', subjectId: 'domain:default/foo' }),
      makeDescriptor({ id: 'v2', entityRef: 'domain:default/bar', subjectId: 'domain:default/bar' }),
    ], 'catalog');

    const results = await store.getViewDescriptors({ entityRef: 'domain:default/foo' });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('v1');
  });

  it('saveModel persists nodes; computeDiagram returns them', async () => {
    const knex = await databases.init('SQLITE_3');
    const store = new ModelStore(knex);
    await store.migrate();

    const domain = { id: 'domain:default/my-domain', depth: 0, name: 'My Domain', description: '', tags: [] as string[] };
    const system = { id: 'system:default/my-system', parentId: 'domain:default/my-domain', depth: 1, name: 'My System', description: '', tags: [] as string[] };
    await store.saveModel(makeModel({ nodes: [domain, system] }), 'catalog');

    const desc = makeDescriptor({ subjectId: 'domain:default/my-domain' });
    await store.saveViewDescriptors([desc], 'catalog');

    const diagram = await store.computeDiagram('view-1');
    expect(diagram).toBeDefined();
    expect(diagram!.nodes.some(n => n.id === 'system:default/my-system')).toBe(true);
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

    const domain = { id: 'domain:default/d1', depth: 0, name: 'D1', description: '', tags: [] as string[] };
    await store.saveModel(makeModel({ nodes: [domain] }), 'catalog');
    await store.saveViewDescriptors([makeDescriptor({ subjectId: 'domain:default/d1' })], 'catalog');

    // First compute — populates cache
    const first = await store.computeDiagram('view-1');
    expect(first).toBeDefined();

    // Resave with updated node
    const updated = { ...domain, name: 'D1 Updated' };
    await store.saveModel(makeModel({ nodes: [updated] }), 'catalog');

    // Cache should be cleared
    const second = await store.computeDiagram('view-1');
    expect(second!.nodes.find(n => n.id === 'domain:default/d1')!.name).toBe('D1 Updated');
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

    await store.saveViewDescriptors([makeDescriptor({ id: 'old-view', subjectId: 'domain:default/d' })], 'catalog');
    await store.saveViewDescriptors([makeDescriptor({ id: 'new-view', subjectId: 'domain:default/d' })], 'catalog');

    const results = await store.getViewDescriptors();
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('new-view');
  });
});

