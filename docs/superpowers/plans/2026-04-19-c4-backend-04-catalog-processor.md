# C4 Backend — Plan 4: CatalogProcessor

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement CatalogProcessor — queries Backstage Catalog API and builds a C4Model from all catalog relationships.

**Architecture:** CatalogProcessor takes a CatalogClient, queries all entities (Domain, System, Component, Group, User), maps them to C4 elements and relationships, returns a complete C4Model. Stateless — called by the scheduler on each sync.

**Tech Stack:** TypeScript, @backstage/catalog-client, @backstage/catalog-model.

**Prerequisite:** Plan 1 (types.ts) must be complete.

---

### Task 1: CatalogProcessor with TDD

**Files:**
- Create: `plugins/c4-backend/src/processors/CatalogProcessor.ts`
- Create: `plugins/c4-backend/src/processors/CatalogProcessor.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// plugins/c4-backend/src/processors/CatalogProcessor.test.ts
import { CatalogClient } from '@backstage/catalog-client';
import { Entity } from '@backstage/catalog-model';
import { CatalogProcessor } from './CatalogProcessor';

function mockCatalogClient(entities: Entity[]): jest.Mocked<CatalogClient> {
  return {
    getEntities: jest.fn().mockResolvedValue({ items: entities }),
  } as unknown as jest.Mocked<CatalogClient>;
}

const domainEntity: Entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Domain',
  metadata: { name: 'my-domain', namespace: 'default', uid: 'domain-uid-1' },
  spec: { owner: 'team-a' },
  relations: [{ type: 'hasPart', targetRef: 'system:default/my-system' }],
};

const systemEntity: Entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'System',
  metadata: { name: 'my-system', namespace: 'default', uid: 'system-uid-1' },
  spec: { owner: 'team-a', domain: 'my-domain' },
  relations: [
    { type: 'partOf', targetRef: 'domain:default/my-domain' },
    { type: 'hasPart', targetRef: 'component:default/my-service' },
  ],
};

const componentEntity: Entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: { name: 'my-service', namespace: 'default', uid: 'comp-uid-1' },
  spec: { type: 'service', owner: 'team-a', system: 'my-system' },
  relations: [
    { type: 'partOf', targetRef: 'system:default/my-system' },
    { type: 'dependsOn', targetRef: 'component:default/other-service' },
    { type: 'providesApi', targetRef: 'api:default/my-api' },
  ],
};

const groupEntity: Entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Group',
  metadata: { name: 'team-a', namespace: 'default', uid: 'group-uid-1' },
  spec: { type: 'team', children: [] },
  relations: [],
};

describe('CatalogProcessor', () => {
  it('builds landscape view from domains and systems', async () => {
    const client = mockCatalogClient([domainEntity, systemEntity, groupEntity]);
    const processor = new CatalogProcessor(client);
    const model = await processor.process();

    expect(model.systems.find(s => s.id === 'domain:default/my-domain')).toBeDefined();
    expect(model.systems.find(s => s.id === 'system:default/my-system')).toBeDefined();

    const landscapeView = model.views.find(v => v.type === 'landscape');
    expect(landscapeView).toBeDefined();
  });

  it('maps Group entities to C4Person', async () => {
    const client = mockCatalogClient([groupEntity]);
    const processor = new CatalogProcessor(client);
    const model = await processor.process();

    expect(model.persons).toHaveLength(1);
    expect(model.persons[0].id).toBe('group:default/team-a');
    expect(model.persons[0].name).toBe('team-a');
  });

  it('maps System entity to C4System', async () => {
    const client = mockCatalogClient([systemEntity]);
    const processor = new CatalogProcessor(client);
    const model = await processor.process();

    const sys = model.systems.find(s => s.id === 'system:default/my-system');
    expect(sys).toBeDefined();
    expect(sys!.catalogEntityRef).toBe('system:default/my-system');
  });

  it('maps Component entity to C4Container', async () => {
    const client = mockCatalogClient([systemEntity, componentEntity]);
    const processor = new CatalogProcessor(client);
    const model = await processor.process();

    const container = model.containers.find(c => c.id === 'component:default/my-service');
    expect(container).toBeDefined();
    expect(container!.systemId).toBe('system:default/my-system');
    expect(container!.catalogEntityRef).toBe('component:default/my-service');
  });

  it('creates C4Relationship from dependsOn relation', async () => {
    const client = mockCatalogClient([componentEntity]);
    const processor = new CatalogProcessor(client);
    const model = await processor.process();

    const rel = model.relationships.find(
      r => r.sourceId === 'component:default/my-service' && r.targetId === 'component:default/other-service',
    );
    expect(rel).toBeDefined();
    expect(rel!.description).toBe('depends on');
  });

  it('creates C4Relationship from providesApi relation', async () => {
    const client = mockCatalogClient([componentEntity]);
    const processor = new CatalogProcessor(client);
    const model = await processor.process();

    const rel = model.relationships.find(
      r => r.sourceId === 'component:default/my-service' && r.targetId === 'api:default/my-api',
    );
    expect(rel).toBeDefined();
    expect(rel!.description).toBe('provides API');
  });

  it('creates container view per system', async () => {
    const client = mockCatalogClient([systemEntity, componentEntity]);
    const processor = new CatalogProcessor(client);
    const model = await processor.process();

    const containerView = model.views.find(
      v => v.type === 'container' && v.entityRef === 'system:default/my-system',
    );
    expect(containerView).toBeDefined();
    expect(containerView!.entityRefs).toContain('component:default/my-service');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn workspace @fulgas/plugin-c4-backend test --testPathPattern=CatalogProcessor --no-coverage`

Expected: FAIL — `Cannot find module './CatalogProcessor'`

- [ ] **Step 3: Implement CatalogProcessor**

```typescript
// plugins/c4-backend/src/processors/CatalogProcessor.ts
import { CatalogClient } from '@backstage/catalog-client';
import { Entity, stringifyEntityRef } from '@backstage/catalog-model';
import { v4 as uuidv4 } from 'uuid';
import { C4Container, C4Model, C4Person, C4Relationship, C4System, C4View } from '../types';

export class CatalogProcessor {
  constructor(private readonly catalogClient: CatalogClient) {}

  async process(): Promise<C4Model> {
    const { items: entities } = await this.catalogClient.getEntities({});

    const persons: C4Person[] = [];
    const systems: C4System[] = [];
    const containers: C4Container[] = [];
    const relationships: C4Relationship[] = [];

    for (const entity of entities) {
      const ref = stringifyEntityRef(entity);

      if (entity.kind === 'Group' || entity.kind === 'User') {
        persons.push({
          id: ref,
          name: entity.metadata.name,
          description: (entity.metadata.description as string) ?? '',
          tags: (entity.metadata.tags as string[]) ?? [],
        });
      }

      if (entity.kind === 'Domain' || entity.kind === 'System') {
        systems.push({
          id: ref,
          name: entity.metadata.name,
          description: (entity.metadata.description as string) ?? '',
          tags: (entity.metadata.tags as string[]) ?? [],
          catalogEntityRef: ref,
        });
      }

      if (entity.kind === 'Component') {
        const systemRef = (entity.relations ?? [])
          .find(r => r.type === 'partOf' && r.targetRef.startsWith('system:'))
          ?.targetRef ?? '';

        containers.push({
          id: ref,
          systemId: systemRef,
          name: entity.metadata.name,
          description: (entity.metadata.description as string) ?? '',
          technology: (entity.spec?.type as string) ?? '',
          tags: (entity.metadata.tags as string[]) ?? [],
          catalogEntityRef: ref,
        });

        for (const relation of entity.relations ?? []) {
          if (relation.type === 'dependsOn') {
            relationships.push({
              id: uuidv4(),
              sourceId: ref,
              targetId: relation.targetRef,
              description: 'depends on',
              technology: '',
              tags: [],
            });
          }
          if (relation.type === 'providesApi') {
            relationships.push({
              id: uuidv4(),
              sourceId: ref,
              targetId: relation.targetRef,
              description: 'provides API',
              technology: '',
              tags: [],
            });
          }
          if (relation.type === 'consumesApi') {
            relationships.push({
              id: uuidv4(),
              sourceId: ref,
              targetId: relation.targetRef,
              description: 'consumes API',
              technology: '',
              tags: [],
            });
          }
        }
      }
    }

    const views = this.buildViews(entities, systems, containers, relationships);

    return { persons, systems, containers, components: [], relationships, views };
  }

  private buildViews(
    entities: Entity[],
    systems: C4System[],
    containers: C4Container[],
    relationships: C4Relationship[],
  ): C4View[] {
    const views: C4View[] = [];

    // Landscape view — all domains and systems
    const landscapeRefs = systems.map(s => s.id);
    views.push({
      id: 'catalog-landscape',
      type: 'landscape',
      title: 'System Landscape',
      entityRefs: landscapeRefs,
      relationshipIds: [],
      source: 'catalog',
    });

    // Container view per system
    for (const system of systems.filter(s => s.catalogEntityRef?.startsWith('system:'))) {
      const systemContainers = containers.filter(c => c.systemId === system.id);
      const containerRefs = systemContainers.map(c => c.id);
      const relIds = relationships
        .filter(r => containerRefs.includes(r.sourceId) || containerRefs.includes(r.targetId))
        .map(r => r.id);

      views.push({
        id: `catalog-container-${system.id}`,
        type: 'container',
        title: `${system.name} — Containers`,
        entityRefs: containerRefs,
        relationshipIds: relIds,
        source: 'catalog',
        entityRef: system.id,
      });
    }

    // Context view per system
    for (const system of systems.filter(s => s.catalogEntityRef?.startsWith('system:'))) {
      views.push({
        id: `catalog-context-${system.id}`,
        type: 'context',
        title: `${system.name} — System Context`,
        entityRefs: [system.id],
        relationshipIds: [],
        source: 'catalog',
        entityRef: system.id,
      });
    }

    return views;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn workspace @fulgas/plugin-c4-backend test --testPathPattern=CatalogProcessor --no-coverage`

Expected: all 7 tests PASS.
