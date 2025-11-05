# C4 Backend — Plan 3: ModelStore

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement ModelStore — the single DB access layer for all C4 data.

**Architecture:** ModelStore wraps a Knex instance. Runs migrations on `migrate()`. All JSON fields serialized/deserialized at this boundary. Hash-based deduplication skips identical snapshots.

**Tech Stack:** TypeScript, Knex, uuid, crypto (Node built-in), @backstage/backend-test-utils (TestDatabases for SQLite in tests).

**Prerequisite:** Plans 1 + 2 complete.

---

### Task 1: ModelStore with TDD

**Files:**
- Create: `plugins/c4-backend/src/store/ModelStore.ts`
- Create: `plugins/c4-backend/src/store/ModelStore.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// plugins/c4-backend/src/store/ModelStore.test.ts
import { TestDatabases } from '@backstage/backend-test-utils';
import { ModelStore } from './ModelStore';
import { C4Model, C4Source } from '../types';

const databases = TestDatabases.create();

function makeModel(overrides: Partial<C4Model> = {}): C4Model {
  return {
    persons: [],
    systems: [],
    containers: [],
    components: [],
    relationships: [],
    views: [],
    ...overrides,
  };
}

describe('ModelStore', () => {
  it('getViews returns empty array on fresh DB', async () => {
    const knex = await databases.init('SQLITE_3');
    const store = new ModelStore(knex);
    await store.migrate();
    const views = await store.getViews();
    expect(views).toEqual([]);
  });

  it('saveModel persists views, getViews returns them', async () => {
    const knex = await databases.init('SQLITE_3');
    const store = new ModelStore(knex);
    await store.migrate();

    const model = makeModel({
      systems: [{ id: 'sys-1', name: 'My System', description: 'A system', tags: [] }],
      views: [{
        id: 'view-1',
        type: 'context',
        title: 'System Context',
        entityRefs: ['system:default/my-system'],
        relationshipIds: [],
        source: 'catalog',
        entityRef: 'system:default/my-system',
      }],
    });

    await store.saveModel(model, 'catalog');
    const views = await store.getViews();
    expect(views).toHaveLength(1);
    expect(views[0].id).toBe('view-1');
    expect(views[0].title).toBe('System Context');
    expect(views[0].source).toBe('catalog');
  });

  it('getViews filters by type', async () => {
    const knex = await databases.init('SQLITE_3');
    const store = new ModelStore(knex);
    await store.migrate();

    const model = makeModel({
      views: [
        { id: 'v1', type: 'landscape', title: 'Landscape', entityRefs: [], relationshipIds: [], source: 'catalog' },
        { id: 'v2', type: 'context', title: 'Context', entityRefs: [], relationshipIds: [], source: 'catalog' },
      ],
    });

    await store.saveModel(model, 'catalog');
    const views = await store.getViews({ type: 'landscape' });
    expect(views).toHaveLength(1);
    expect(views[0].id).toBe('v1');
  });

  it('getViewModel returns elements and relationships for a view', async () => {
    const knex = await databases.init('SQLITE_3');
    const store = new ModelStore(knex);
    await store.migrate();

    const model = makeModel({
      systems: [{ id: 'sys-1', name: 'My System', description: '', tags: [] }],
      relationships: [{ id: 'rel-1', sourceId: 'sys-1', targetId: 'sys-2', description: 'calls', technology: '', tags: [] }],
      views: [{
        id: 'view-1',
        type: 'context',
        title: 'Context',
        entityRefs: ['sys-1'],
        relationshipIds: ['rel-1'],
        source: 'catalog',
      }],
    });

    await store.saveModel(model, 'catalog');
    const result = await store.getViewModel('view-1');
    expect(result.systems).toHaveLength(1);
    expect(result.systems[0].id).toBe('sys-1');
    expect(result.relationships).toHaveLength(1);
    expect(result.relationships[0].id).toBe('rel-1');
  });

  it('getEntityViews filters by entityRef', async () => {
    const knex = await databases.init('SQLITE_3');
    const store = new ModelStore(knex);
    await store.migrate();

    const model = makeModel({
      views: [
        { id: 'v1', type: 'context', title: 'A', entityRefs: [], relationshipIds: [], source: 'catalog', entityRef: 'system:default/foo' },
        { id: 'v2', type: 'context', title: 'B', entityRefs: [], relationshipIds: [], source: 'catalog', entityRef: 'system:default/bar' },
      ],
    });

    await store.saveModel(model, 'catalog');
    const views = await store.getEntityViews('system:default/foo');
    expect(views).toHaveLength(1);
    expect(views[0].id).toBe('v1');
  });

  it('saveSnapshot creates snapshot, getSnapshots returns it without data', async () => {
    const knex = await databases.init('SQLITE_3');
    const store = new ModelStore(knex);
    await store.migrate();

    const model = makeModel({
      views: [{ id: 'v1', type: 'landscape', title: 'L', entityRefs: [], relationshipIds: [], source: 'catalog' }],
    });
    await store.saveModel(model, 'catalog');

    const viewModel = await store.getViewModel('v1');
    await store.saveSnapshot('v1', viewModel, 100);

    const snapshots = await store.getSnapshots('v1');
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].viewId).toBe('v1');
    expect((snapshots[0] as any).data).toBeUndefined();
  });

  it('saveSnapshot skips duplicate when model hash matches', async () => {
    const knex = await databases.init('SQLITE_3');
    const store = new ModelStore(knex);
    await store.migrate();

    const model = makeModel({
      views: [{ id: 'v1', type: 'landscape', title: 'L', entityRefs: [], relationshipIds: [], source: 'catalog' }],
    });
    await store.saveModel(model, 'catalog');
    const viewModel = await store.getViewModel('v1');

    await store.saveSnapshot('v1', viewModel, 100);
    await store.saveSnapshot('v1', viewModel, 100); // same model — should skip

    const snapshots = await store.getSnapshots('v1');
    expect(snapshots).toHaveLength(1);
  });

  it('saveSnapshot prunes old snapshots when maxSnapshots exceeded', async () => {
    const knex = await databases.init('SQLITE_3');
    const store = new ModelStore(knex);
    await store.migrate();

    const model = makeModel({
      views: [{ id: 'v1', type: 'landscape', title: 'L', entityRefs: [], relationshipIds: [], source: 'catalog' }],
    });
    await store.saveModel(model, 'catalog');

    // Save 3 snapshots with different content each time
    for (let i = 0; i < 3; i++) {
      const m = { ...makeModel(), systems: [{ id: `sys-${i}`, name: `S${i}`, description: '', tags: [] }] };
      await store.saveSnapshot('v1', m, 2);
    }

    const snapshots = await store.getSnapshots('v1');
    expect(snapshots).toHaveLength(2);
  });

  it('getSyncStatus returns nulls on fresh DB', async () => {
    const knex = await databases.init('SQLITE_3');
    const store = new ModelStore(knex);
    await store.migrate();

    const status = await store.getSyncStatus();
    expect(status.lastCatalogSync).toBeNull();
    expect(status.lastDslSync).toBeNull();
    expect(status.catalogStatus).toBe('ok');
    expect(status.dslStatus).toBe('ok');
  });

  it('updateSyncStatus updates timestamp and status', async () => {
    const knex = await databases.init('SQLITE_3');
    const store = new ModelStore(knex);
    await store.migrate();

    await store.updateSyncStatus('catalog', 'ok');
    const status = await store.getSyncStatus();
    expect(status.lastCatalogSync).not.toBeNull();
    expect(status.catalogStatus).toBe('ok');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn workspace @fulgas/plugin-c4-backend test --testPathPattern=ModelStore --no-coverage`

Expected: FAIL — `Cannot find module './ModelStore'`

- [ ] **Step 3: Implement ModelStore**

```typescript
// plugins/c4-backend/src/store/ModelStore.ts
import crypto from 'crypto';
import { Knex } from 'knex';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { C4Model, C4Source, C4View, C4ViewType, C4Snapshot } from '../types';

export class ModelStore {
  constructor(private readonly db: Knex) {}

  async migrate(): Promise<void> {
    await this.db.migrate.latest({
      directory: path.join(__dirname, 'migrations'),
      loadExtensions: ['.ts', '.js'],
    });
  }

  async saveModel(model: C4Model, source: C4Source): Promise<void> {
    await this.db.transaction(async trx => {
      // Delete existing data for this source
      await trx('c4_elements').where({ source }).delete();
      await trx('c4_relationships').where({ source }).delete();
      await trx('c4_views').where({ source }).delete();

      // Insert persons
      for (const p of model.persons) {
        await trx('c4_elements').insert({
          id: p.id,
          type: 'person',
          name: p.name,
          description: p.description,
          technology: null,
          tags: JSON.stringify(p.tags),
          parent_id: null,
          catalog_entity_ref: null,
          source,
        });
      }

      // Insert systems
      for (const s of model.systems) {
        await trx('c4_elements').insert({
          id: s.id,
          type: 'system',
          name: s.name,
          description: s.description,
          technology: null,
          tags: JSON.stringify(s.tags),
          parent_id: null,
          catalog_entity_ref: s.catalogEntityRef ?? null,
          source,
        });
      }

      // Insert containers
      for (const c of model.containers) {
        await trx('c4_elements').insert({
          id: c.id,
          type: 'container',
          name: c.name,
          description: c.description,
          technology: c.technology,
          tags: JSON.stringify(c.tags),
          parent_id: c.systemId,
          catalog_entity_ref: c.catalogEntityRef ?? null,
          source,
        });
      }

      // Insert components
      for (const c of model.components) {
        await trx('c4_elements').insert({
          id: c.id,
          type: 'component',
          name: c.name,
          description: c.description,
          technology: c.technology,
          tags: JSON.stringify(c.tags),
          parent_id: c.containerId,
          catalog_entity_ref: c.catalogEntityRef ?? null,
          source,
        });
      }

      // Insert relationships
      for (const r of model.relationships) {
        await trx('c4_relationships').insert({
          id: r.id,
          source_id: r.sourceId,
          target_id: r.targetId,
          description: r.description,
          technology: r.technology,
          tags: JSON.stringify(r.tags),
          source,
        });
      }

      // Insert views
      for (const v of model.views) {
        await trx('c4_views').insert({
          id: v.id,
          type: v.type,
          title: v.title,
          entity_refs: JSON.stringify(v.entityRefs),
          relationship_ids: JSON.stringify(v.relationshipIds),
          source: v.source,
          entity_ref: v.entityRef ?? null,
        });
      }
    });
  }

  async getViews(opts?: { type?: C4ViewType; entityRef?: string }): Promise<C4View[]> {
    let query = this.db('c4_views');
    if (opts?.type) query = query.where({ type: opts.type });
    if (opts?.entityRef) query = query.where({ entity_ref: opts.entityRef });
    const rows = await query;
    return rows.map(this.rowToView);
  }

  async getView(id: string): Promise<C4View | undefined> {
    const row = await this.db('c4_views').where({ id }).first();
    return row ? this.rowToView(row) : undefined;
  }

  async getViewModel(viewId: string): Promise<C4Model> {
    const view = await this.getView(viewId);
    if (!view) {
      return { persons: [], systems: [], containers: [], components: [], relationships: [], views: [] };
    }

    const elementRows = await this.db('c4_elements')
      .whereIn('id', view.entityRefs.length > 0 ? view.entityRefs : ['__none__']);

    const relationshipRows = view.relationshipIds.length > 0
      ? await this.db('c4_relationships').whereIn('id', view.relationshipIds)
      : [];

    return {
      persons: elementRows.filter(r => r.type === 'person').map(r => ({
        id: r.id, name: r.name, description: r.description, tags: JSON.parse(r.tags),
      })),
      systems: elementRows.filter(r => r.type === 'system').map(r => ({
        id: r.id, name: r.name, description: r.description, tags: JSON.parse(r.tags),
        catalogEntityRef: r.catalog_entity_ref ?? undefined,
      })),
      containers: elementRows.filter(r => r.type === 'container').map(r => ({
        id: r.id, systemId: r.parent_id, name: r.name, description: r.description,
        technology: r.technology ?? '', tags: JSON.parse(r.tags),
        catalogEntityRef: r.catalog_entity_ref ?? undefined,
      })),
      components: elementRows.filter(r => r.type === 'component').map(r => ({
        id: r.id, containerId: r.parent_id, name: r.name, description: r.description,
        technology: r.technology ?? '', tags: JSON.parse(r.tags),
        catalogEntityRef: r.catalog_entity_ref ?? undefined,
      })),
      relationships: relationshipRows.map(r => ({
        id: r.id, sourceId: r.source_id, targetId: r.target_id,
        description: r.description, technology: r.technology, tags: JSON.parse(r.tags),
      })),
      views: [view],
    };
  }

  async getEntityViews(entityRef: string): Promise<C4View[]> {
    const rows = await this.db('c4_views').where({ entity_ref: entityRef });
    return rows.map(this.rowToView);
  }

  async saveSnapshot(viewId: string, model: C4Model, maxSnapshots: number): Promise<void> {
    const data = JSON.stringify(model);
    const hash = crypto.createHash('md5').update(data).digest('hex');

    // Skip if latest snapshot has same hash
    const latest = await this.db('c4_snapshots')
      .where({ view_id: viewId })
      .orderBy('created_at', 'desc')
      .first();
    if (latest && latest.model_hash === hash) return;

    await this.db('c4_snapshots').insert({
      id: uuidv4(),
      view_id: viewId,
      model_hash: hash,
      data,
      created_at: new Date().toISOString(),
    });

    // Prune if over limit
    const count = await this.db('c4_snapshots').where({ view_id: viewId }).count('id as c').first();
    const total = Number((count as any).c);
    if (total > maxSnapshots) {
      const oldest = await this.db('c4_snapshots')
        .where({ view_id: viewId })
        .orderBy('created_at', 'asc')
        .limit(total - maxSnapshots)
        .select('id');
      await this.db('c4_snapshots').whereIn('id', oldest.map(r => r.id)).delete();
    }
  }

  async getSnapshots(viewId: string): Promise<Omit<C4Snapshot, 'data'>[]> {
    const rows = await this.db('c4_snapshots')
      .where({ view_id: viewId })
      .orderBy('created_at', 'desc')
      .select('id', 'view_id', 'model_hash', 'created_at');
    return rows.map(r => ({
      id: r.id,
      viewId: r.view_id,
      modelHash: r.model_hash,
      createdAt: r.created_at,
    }));
  }

  async getSnapshot(id: string): Promise<C4Snapshot | undefined> {
    const row = await this.db('c4_snapshots').where({ id }).first();
    if (!row) return undefined;
    return { id: row.id, viewId: row.view_id, modelHash: row.model_hash, data: row.data, createdAt: row.created_at };
  }

  async updateSyncStatus(source: C4Source, status: 'ok' | 'error'): Promise<void> {
    const now = new Date().toISOString();
    if (source === 'catalog') {
      await this.db('c4_sync_status').where({ id: 1 }).update({ last_catalog_sync: now, catalog_status: status });
    } else {
      await this.db('c4_sync_status').where({ id: 1 }).update({ last_dsl_sync: now, dsl_status: status });
    }
  }

  async getSyncStatus(): Promise<{
    lastCatalogSync: string | null;
    lastDslSync: string | null;
    catalogStatus: string;
    dslStatus: string;
  }> {
    const row = await this.db('c4_sync_status').where({ id: 1 }).first();
    return {
      lastCatalogSync: row?.last_catalog_sync ?? null,
      lastDslSync: row?.last_dsl_sync ?? null,
      catalogStatus: row?.catalog_status ?? 'ok',
      dslStatus: row?.dsl_status ?? 'ok',
    };
  }

  private rowToView(row: any): C4View {
    return {
      id: row.id,
      type: row.type,
      title: row.title,
      entityRefs: JSON.parse(row.entity_refs),
      relationshipIds: JSON.parse(row.relationship_ids),
      source: row.source,
      entityRef: row.entity_ref ?? undefined,
    };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn workspace @fulgas/plugin-c4-backend test --testPathPattern=ModelStore --no-coverage`

Expected: all 9 tests PASS.
