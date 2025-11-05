# C4 Backend — Plan 5: DSLProcessor

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement DSLProcessor — discovers Structurizr DSL files from catalog annotations or convention path, fetches them via SCM integration, parses them into C4Model.

**Architecture:** DSLProcessor takes a CatalogClient and a UrlReader (from @backstage/backend-common). For each entity, checks for `fulgas.io/c4-model` annotation; if absent, checks `c4-model.dsl` at repo root via `backstage.io/source-location` annotation. Parses DSL with `structurizr-parser` npm package.

**Tech Stack:** TypeScript, @backstage/catalog-client, @backstage/catalog-model, @backstage/backend-common (UrlReader), structurizr-parser ^0.4.0, uuid.

**Prerequisite:** Plans 1 + 4 complete.

---

### Task 1: Add structurizr-parser dep and implement DSLProcessor

**Files:**
- Modify: `plugins/c4-backend/package.json`
- Create: `plugins/c4-backend/src/processors/DSLProcessor.ts`
- Create: `plugins/c4-backend/src/processors/DSLProcessor.test.ts`

- [ ] **Step 1: Add structurizr-parser dependency**

In `plugins/c4-backend/package.json`, add to `dependencies`:
```json
"structurizr-parser": "^0.4.0",
"@backstage/backend-common": "^0.21.0"
```

Run: `yarn install`

Expected: no errors.

- [ ] **Step 2: Write failing tests**

```typescript
// plugins/c4-backend/src/processors/DSLProcessor.test.ts
import { CatalogClient } from '@backstage/catalog-client';
import { Entity } from '@backstage/catalog-model';
import { UrlReader } from '@backstage/backend-common';
import { DSLProcessor } from './DSLProcessor';

const SAMPLE_DSL = `
workspace {
  model {
    user = person "User" "An external user"
    mySystem = softwareSystem "My System" "Does things" {
      webapp = container "Web App" "Frontend" "TypeScript"
      api = container "API" "Backend" "Node.js"
    }
    user -> webapp "Uses"
    webapp -> api "Calls"
  }
  views {
    systemContext mySystem "Context" {
      include *
    }
    container mySystem "Containers" {
      include *
    }
  }
}
`;

function mockCatalogClient(entities: Entity[]): jest.Mocked<CatalogClient> {
  return {
    getEntities: jest.fn().mockResolvedValue({ items: entities }),
  } as unknown as jest.Mocked<CatalogClient>;
}

function mockUrlReader(content: string): jest.Mocked<UrlReader> {
  return {
    readUrl: jest.fn().mockResolvedValue({
      buffer: jest.fn().mockResolvedValue(Buffer.from(content)),
    }),
  } as unknown as jest.Mocked<UrlReader>;
}

const entityWithAnnotation: Entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'System',
  metadata: {
    name: 'my-system',
    namespace: 'default',
    annotations: {
      'fulgas.io/c4-model': 'https://github.com/org/repo/blob/main/c4-model.dsl',
      'backstage.io/source-location': 'url:https://github.com/org/repo/blob/main/',
    },
  },
  spec: { owner: 'team-a' },
  relations: [],
};

const entityWithConvention: Entity = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'System',
  metadata: {
    name: 'other-system',
    namespace: 'default',
    annotations: {
      'backstage.io/source-location': 'url:https://github.com/org/repo/blob/main/',
    },
  },
  spec: { owner: 'team-a' },
  relations: [],
};

describe('DSLProcessor', () => {
  it('reads DSL file from annotation URL', async () => {
    const client = mockCatalogClient([entityWithAnnotation]);
    const reader = mockUrlReader(SAMPLE_DSL);
    const processor = new DSLProcessor(client, reader);

    const model = await processor.process();

    expect(reader.readUrl).toHaveBeenCalledWith(
      'https://github.com/org/repo/blob/main/c4-model.dsl',
    );
    expect(model.persons.length).toBeGreaterThan(0);
  });

  it('falls back to convention path when no annotation', async () => {
    const client = mockCatalogClient([entityWithConvention]);
    const reader = mockUrlReader(SAMPLE_DSL);
    const processor = new DSLProcessor(client, reader);

    await processor.process();

    expect(reader.readUrl).toHaveBeenCalledWith(
      'https://github.com/org/repo/blob/main/c4-model.dsl',
    );
  });

  it('parses persons from DSL', async () => {
    const client = mockCatalogClient([entityWithAnnotation]);
    const reader = mockUrlReader(SAMPLE_DSL);
    const processor = new DSLProcessor(client, reader);

    const model = await processor.process();
    expect(model.persons.find(p => p.name === 'User')).toBeDefined();
  });

  it('parses systems from DSL', async () => {
    const client = mockCatalogClient([entityWithAnnotation]);
    const reader = mockUrlReader(SAMPLE_DSL);
    const processor = new DSLProcessor(client, reader);

    const model = await processor.process();
    expect(model.systems.find(s => s.name === 'My System')).toBeDefined();
  });

  it('parses containers from DSL', async () => {
    const client = mockCatalogClient([entityWithAnnotation]);
    const reader = mockUrlReader(SAMPLE_DSL);
    const processor = new DSLProcessor(client, reader);

    const model = await processor.process();
    expect(model.containers.find(c => c.name === 'Web App')).toBeDefined();
    expect(model.containers.find(c => c.name === 'API')).toBeDefined();
  });

  it('parses relationships from DSL', async () => {
    const client = mockCatalogClient([entityWithAnnotation]);
    const reader = mockUrlReader(SAMPLE_DSL);
    const processor = new DSLProcessor(client, reader);

    const model = await processor.process();
    expect(model.relationships.length).toBeGreaterThan(0);
  });

  it('creates views from DSL view definitions', async () => {
    const client = mockCatalogClient([entityWithAnnotation]);
    const reader = mockUrlReader(SAMPLE_DSL);
    const processor = new DSLProcessor(client, reader);

    const model = await processor.process();
    expect(model.views.find(v => v.type === 'context')).toBeDefined();
    expect(model.views.find(v => v.type === 'container')).toBeDefined();
  });

  it('skips entity if readUrl throws', async () => {
    const client = mockCatalogClient([entityWithAnnotation]);
    const reader = {
      readUrl: jest.fn().mockRejectedValue(new Error('Not Found')),
    } as unknown as jest.Mocked<UrlReader>;
    const processor = new DSLProcessor(client, reader);

    const model = await processor.process();
    expect(model.persons).toHaveLength(0);
    expect(model.views).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `yarn workspace @fulgas/plugin-c4-backend test --testPathPattern=DSLProcessor --no-coverage`

Expected: FAIL — `Cannot find module './DSLProcessor'`

- [ ] **Step 4: Implement DSLProcessor**

```typescript
// plugins/c4-backend/src/processors/DSLProcessor.ts
import { UrlReader } from '@backstage/backend-common';
import { CatalogClient } from '@backstage/catalog-client';
import { Entity, stringifyEntityRef } from '@backstage/catalog-model';
import { parse } from 'structurizr-parser';
import { v4 as uuidv4 } from 'uuid';
import {
  C4Container,
  C4Model,
  C4Person,
  C4Relationship,
  C4System,
  C4View,
} from '../types';

const C4_MODEL_ANNOTATION = 'fulgas.io/c4-model';
const SOURCE_LOCATION_ANNOTATION = 'backstage.io/source-location';
const CONVENTION_PATH = 'c4-model.dsl';

export class DSLProcessor {
  constructor(
    private readonly catalogClient: CatalogClient,
    private readonly reader: UrlReader,
  ) {}

  async process(): Promise<C4Model> {
    const { items: entities } = await this.catalogClient.getEntities({});
    const merged: C4Model = {
      persons: [],
      systems: [],
      containers: [],
      components: [],
      relationships: [],
      views: [],
    };

    for (const entity of entities) {
      const url = this.getDslUrl(entity);
      if (!url) continue;

      try {
        const model = await this.processEntity(entity, url);
        merged.persons.push(...model.persons);
        merged.systems.push(...model.systems);
        merged.containers.push(...model.containers);
        merged.components.push(...model.components);
        merged.relationships.push(...model.relationships);
        merged.views.push(...model.views);
      } catch {
        // Skip entities where DSL file is missing or unparseable
      }
    }

    return merged;
  }

  private getDslUrl(entity: Entity): string | undefined {
    const annotations = entity.metadata.annotations ?? {};
    const annotation = annotations[C4_MODEL_ANNOTATION];
    if (annotation) return annotation;

    const sourceLocation = annotations[SOURCE_LOCATION_ANNOTATION];
    if (sourceLocation) {
      const base = sourceLocation.replace(/^url:/, '').replace(/\/$/, '');
      return `${base}/${CONVENTION_PATH}`;
    }

    return undefined;
  }

  private async processEntity(entity: Entity, url: string): Promise<C4Model> {
    const response = await this.reader.readUrl(url);
    const buffer = await response.buffer();
    const dslContent = buffer.toString('utf-8');
    const entityRef = stringifyEntityRef(entity);

    return this.parseDsl(dslContent, entityRef);
  }

  private parseDsl(dslContent: string, entityRef: string): C4Model {
    const workspace = parse(dslContent);
    const model = workspace.model;

    const persons: C4Person[] = [];
    const systems: C4System[] = [];
    const containers: C4Container[] = [];
    const relationships: C4Relationship[] = [];
    const views: C4View[] = [];

    const elementIdMap = new Map<string, string>(); // DSL var name → our id

    for (const element of model?.people ?? []) {
      const id = uuidv4();
      elementIdMap.set(element.name, id);
      persons.push({
        id,
        name: element.name,
        description: element.description ?? '',
        tags: element.tags ?? [],
      });
    }

    for (const softwareSystem of model?.softwareSystems ?? []) {
      const sysId = uuidv4();
      elementIdMap.set(softwareSystem.name, sysId);
      systems.push({
        id: sysId,
        name: softwareSystem.name,
        description: softwareSystem.description ?? '',
        tags: softwareSystem.tags ?? [],
      });

      for (const container of softwareSystem.containers ?? []) {
        const cId = uuidv4();
        elementIdMap.set(container.name, cId);
        containers.push({
          id: cId,
          systemId: sysId,
          name: container.name,
          description: container.description ?? '',
          technology: container.technology ?? '',
          tags: container.tags ?? [],
        });
      }
    }

    for (const rel of model?.relationships ?? []) {
      relationships.push({
        id: uuidv4(),
        sourceId: elementIdMap.get(rel.sourceId) ?? rel.sourceId,
        targetId: elementIdMap.get(rel.destinationId) ?? rel.destinationId,
        description: rel.description ?? '',
        technology: rel.technology ?? '',
        tags: [],
      });
    }

    for (const view of workspace.views?.systemContextViews ?? []) {
      views.push({
        id: uuidv4(),
        type: 'context',
        title: view.title ?? `${view.softwareSystemId} — System Context`,
        entityRefs: [...persons.map(p => p.id), ...systems.map(s => s.id)],
        relationshipIds: relationships.map(r => r.id),
        source: 'dsl',
        entityRef,
      });
    }

    for (const view of workspace.views?.containerViews ?? []) {
      const sysId = elementIdMap.get(view.softwareSystemId);
      const viewContainers = sysId
        ? containers.filter(c => c.systemId === sysId)
        : containers;
      views.push({
        id: uuidv4(),
        type: 'container',
        title: view.title ?? `${view.softwareSystemId} — Containers`,
        entityRefs: viewContainers.map(c => c.id),
        relationshipIds: relationships.map(r => r.id),
        source: 'dsl',
        entityRef,
      });
    }

    return { persons, systems, containers, components: [], relationships, views };
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `yarn workspace @fulgas/plugin-c4-backend test --testPathPattern=DSLProcessor --no-coverage`

Expected: all 8 tests PASS.
