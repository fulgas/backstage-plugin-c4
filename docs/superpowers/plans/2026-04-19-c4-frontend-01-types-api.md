# C4 Frontend — Plan 1: Types, API Ref & Client

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Define frontend TypeScript types, create C4Api interface + ApiRef, implement C4ApiClient that calls the backend REST API.

**Architecture:** C4ApiClient registered as Backstage ApiRef. Uses `discoveryApi` to resolve backend base URL. All methods map 1:1 to backend endpoints. Tested by mocking fetch.

**Tech Stack:** TypeScript, @backstage/core-plugin-api, @backstage/test-utils.

**Prerequisite:** None (first frontend plan).

---

### Task 1: types.ts

**Files:**
- Create: `plugins/c4/src/types.ts`

- [ ] **Step 1: Create types.ts**

```typescript
// plugins/c4/src/types.ts
export type C4ViewType = 'landscape' | 'context' | 'container' | 'component';
export type C4Source = 'catalog' | 'dsl';

export interface C4Person {
  id: string;
  name: string;
  description: string;
  tags: string[];
}

export interface C4System {
  id: string;
  name: string;
  description: string;
  tags: string[];
  catalogEntityRef?: string;
}

export interface C4Container {
  id: string;
  systemId: string;
  name: string;
  description: string;
  technology: string;
  tags: string[];
  catalogEntityRef?: string;
}

export interface C4Component {
  id: string;
  containerId: string;
  name: string;
  description: string;
  technology: string;
  tags: string[];
  catalogEntityRef?: string;
}

export interface C4Relationship {
  id: string;
  sourceId: string;
  targetId: string;
  description: string;
  technology: string;
  tags: string[];
}

export interface C4View {
  id: string;
  type: C4ViewType;
  title: string;
  entityRefs: string[];
  relationshipIds: string[];
  source: C4Source;
  entityRef?: string;
}

export interface C4Snapshot {
  id: string;
  viewId: string;
  modelHash: string;
  createdAt: string;
}

export interface C4Model {
  persons: C4Person[];
  systems: C4System[];
  containers: C4Container[];
  components: C4Component[];
  relationships: C4Relationship[];
  views: C4View[];
}

export interface C4ViewModel {
  view: C4View;
  model: C4Model;
}

export interface C4Diff {
  added: Partial<C4Model>;
  removed: Partial<C4Model>;
  changed: Partial<C4Model>;
}
```

- [ ] **Step 2: Verify types compile**

Run: `yarn workspace @fulgas/plugin-c4 tsc --noEmit`

Expected: no errors.

---

### Task 2: C4Api + C4ApiClient with TDD

**Files:**
- Create: `plugins/c4/src/api/C4Api.ts`
- Create: `plugins/c4/src/api/C4ApiClient.ts`
- Create: `plugins/c4/src/api/C4ApiClient.test.ts`

- [ ] **Step 3: Create C4Api.ts**

```typescript
// plugins/c4/src/api/C4Api.ts
import { createApiRef } from '@backstage/core-plugin-api';
import { C4Diff, C4Model, C4Snapshot, C4View, C4ViewModel, C4ViewType } from '../types';

export interface C4Api {
  getViews(opts?: { level?: C4ViewType; domain?: string }): Promise<C4View[]>;
  getView(id: string): Promise<C4ViewModel>;
  getEntityViews(kind: string, namespace: string, name: string): Promise<C4View[]>;
  getLandscape(): Promise<C4ViewModel>;
  getViewHistory(id: string): Promise<C4Snapshot[]>;
  getViewDiff(id: string, from: string, to: string): Promise<C4Diff>;
  triggerSync(): Promise<{ status: string }>;
}

export const c4ApiRef = createApiRef<C4Api>({
  id: 'plugin.c4.service',
});
```

- [ ] **Step 4: Write failing tests**

```typescript
// plugins/c4/src/api/C4ApiClient.test.ts
import { C4ApiClient } from './C4ApiClient';
import { DiscoveryApi, FetchApi } from '@backstage/core-plugin-api';

function mockDiscovery(): jest.Mocked<DiscoveryApi> {
  return {
    getBaseUrl: jest.fn().mockResolvedValue('http://localhost:7007/api/c4'),
  } as unknown as jest.Mocked<DiscoveryApi>;
}

function mockFetch(body: unknown, status = 200): jest.Mocked<FetchApi> {
  return {
    fetch: jest.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: jest.fn().mockResolvedValue(body),
    }),
  } as unknown as jest.Mocked<FetchApi>;
}

describe('C4ApiClient', () => {
  it('getViews calls GET /views', async () => {
    const fetchApi = mockFetch([]);
    const client = new C4ApiClient({ discoveryApi: mockDiscovery(), fetchApi });
    const result = await client.getViews();
    expect(fetchApi.fetch).toHaveBeenCalledWith('http://localhost:7007/api/c4/views');
    expect(result).toEqual([]);
  });

  it('getViews passes level query param', async () => {
    const fetchApi = mockFetch([]);
    const client = new C4ApiClient({ discoveryApi: mockDiscovery(), fetchApi });
    await client.getViews({ level: 'landscape' });
    expect(fetchApi.fetch).toHaveBeenCalledWith(
      'http://localhost:7007/api/c4/views?level=landscape',
    );
  });

  it('getView calls GET /views/:id', async () => {
    const fetchApi = mockFetch({ view: {}, model: {} });
    const client = new C4ApiClient({ discoveryApi: mockDiscovery(), fetchApi });
    await client.getView('view-1');
    expect(fetchApi.fetch).toHaveBeenCalledWith(
      'http://localhost:7007/api/c4/views/view-1',
    );
  });

  it('getEntityViews calls correct URL', async () => {
    const fetchApi = mockFetch([]);
    const client = new C4ApiClient({ discoveryApi: mockDiscovery(), fetchApi });
    await client.getEntityViews('system', 'default', 'my-system');
    expect(fetchApi.fetch).toHaveBeenCalledWith(
      'http://localhost:7007/api/c4/entity/system/default/my-system/views',
    );
  });

  it('getLandscape calls GET /landscape', async () => {
    const fetchApi = mockFetch({ view: {}, model: {} });
    const client = new C4ApiClient({ discoveryApi: mockDiscovery(), fetchApi });
    await client.getLandscape();
    expect(fetchApi.fetch).toHaveBeenCalledWith(
      'http://localhost:7007/api/c4/landscape',
    );
  });

  it('getViewHistory calls GET /views/:id/history', async () => {
    const fetchApi = mockFetch([]);
    const client = new C4ApiClient({ discoveryApi: mockDiscovery(), fetchApi });
    await client.getViewHistory('view-1');
    expect(fetchApi.fetch).toHaveBeenCalledWith(
      'http://localhost:7007/api/c4/views/view-1/history',
    );
  });

  it('getViewDiff calls GET /views/:id/diff with params', async () => {
    const fetchApi = mockFetch({ added: {}, removed: {}, changed: {} });
    const client = new C4ApiClient({ discoveryApi: mockDiscovery(), fetchApi });
    await client.getViewDiff('view-1', 'snap-a', 'snap-b');
    expect(fetchApi.fetch).toHaveBeenCalledWith(
      'http://localhost:7007/api/c4/views/view-1/diff?from=snap-a&to=snap-b',
    );
  });

  it('triggerSync calls POST /sync', async () => {
    const fetchApi = mockFetch({ status: 'started' });
    const client = new C4ApiClient({ discoveryApi: mockDiscovery(), fetchApi });
    const result = await client.triggerSync();
    expect(fetchApi.fetch).toHaveBeenCalledWith(
      'http://localhost:7007/api/c4/sync',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result.status).toBe('started');
  });
});
```

- [ ] **Step 5: Run tests to verify they fail**

Run: `yarn workspace @fulgas/plugin-c4 test --testPathPattern=C4ApiClient --no-coverage`

Expected: FAIL — `Cannot find module './C4ApiClient'`

- [ ] **Step 6: Implement C4ApiClient**

```typescript
// plugins/c4/src/api/C4ApiClient.ts
import { DiscoveryApi, FetchApi } from '@backstage/core-plugin-api';
import { C4Api } from './C4Api';
import { C4Diff, C4Snapshot, C4View, C4ViewModel, C4ViewType } from '../types';

interface Options {
  discoveryApi: DiscoveryApi;
  fetchApi: FetchApi;
}

export class C4ApiClient implements C4Api {
  constructor(private readonly options: Options) {}

  private async getBaseUrl(): Promise<string> {
    return this.options.discoveryApi.getBaseUrl('c4');
  }

  async getViews(opts?: { level?: C4ViewType; domain?: string }): Promise<C4View[]> {
    const base = await this.getBaseUrl();
    const params = new URLSearchParams();
    if (opts?.level) params.set('level', opts.level);
    if (opts?.domain) params.set('domain', opts.domain);
    const query = params.toString() ? `?${params.toString()}` : '';
    const res = await this.options.fetchApi.fetch(`${base}/views${query}`);
    return res.json();
  }

  async getView(id: string): Promise<C4ViewModel> {
    const base = await this.getBaseUrl();
    const res = await this.options.fetchApi.fetch(`${base}/views/${id}`);
    return res.json();
  }

  async getEntityViews(kind: string, namespace: string, name: string): Promise<C4View[]> {
    const base = await this.getBaseUrl();
    const res = await this.options.fetchApi.fetch(`${base}/entity/${kind}/${namespace}/${name}/views`);
    return res.json();
  }

  async getLandscape(): Promise<C4ViewModel> {
    const base = await this.getBaseUrl();
    const res = await this.options.fetchApi.fetch(`${base}/landscape`);
    return res.json();
  }

  async getViewHistory(id: string): Promise<C4Snapshot[]> {
    const base = await this.getBaseUrl();
    const res = await this.options.fetchApi.fetch(`${base}/views/${id}/history`);
    return res.json();
  }

  async getViewDiff(id: string, from: string, to: string): Promise<C4Diff> {
    const base = await this.getBaseUrl();
    const res = await this.options.fetchApi.fetch(`${base}/views/${id}/diff?from=${from}&to=${to}`);
    return res.json();
  }

  async triggerSync(): Promise<{ status: string }> {
    const base = await this.getBaseUrl();
    const res = await this.options.fetchApi.fetch(`${base}/sync`, { method: 'POST' });
    return res.json();
  }
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `yarn workspace @fulgas/plugin-c4 test --testPathPattern=C4ApiClient --no-coverage`

Expected: all 8 tests PASS.
