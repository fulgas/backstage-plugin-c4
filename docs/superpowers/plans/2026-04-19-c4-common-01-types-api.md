# C4 Common — Plan 1: Types + API Client

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create `@fulgas/plugin-c4-common` types, C4Api ref+interface, and C4ApiClient.

**Architecture:** Shared package. All other frontend packages import types and API client from here.

**Tech Stack:** TypeScript, @backstage/core-plugin-api, swr.

**Prerequisite:** Plan 0 (scaffold) complete.

---

### Task 1: types.ts

**Files:**
- Create: `plugins/c4-common/src/types.ts`

- [ ] **Step 1: Write types.ts**

```typescript
// plugins/c4-common/src/types.ts
export type C4ViewType = 'landscape' | 'context' | 'container' | 'component';
export type C4Source = 'catalog' | 'dsl';

export interface C4Person { id: string; name: string; description: string; tags: string[]; }
export interface C4System { id: string; name: string; description: string; tags: string[]; catalogEntityRef?: string; }
export interface C4Container { id: string; systemId: string; name: string; description: string; technology: string; tags: string[]; catalogEntityRef?: string; }
export interface C4Component { id: string; containerId: string; name: string; description: string; technology: string; tags: string[]; catalogEntityRef?: string; }
export interface C4Relationship { id: string; sourceId: string; targetId: string; description: string; technology: string; tags: string[]; }
export interface C4View { id: string; type: C4ViewType; title: string; entityRefs: string[]; relationshipIds: string[]; source: C4Source; entityRef?: string; }
export interface C4Snapshot { id: string; viewId: string; modelHash: string; createdAt: string; }
export interface C4Model { persons: C4Person[]; systems: C4System[]; containers: C4Container[]; components: C4Component[]; relationships: C4Relationship[]; views: C4View[]; }
export interface C4ViewModel { view: C4View; model: C4Model; }
export interface C4Diff { added: Partial<C4Model>; removed: Partial<C4Model>; changed: Partial<C4Model>; }
```

---

### Task 2: C4Api + C4ApiClient

**Files:**
- Create: `plugins/c4-common/src/api/C4Api.ts`
- Create: `plugins/c4-common/src/api/C4ApiClient.ts`
- Create: `plugins/c4-common/src/api/C4ApiClient.test.ts`

- [ ] **Step 2: Create C4Api.ts**

```typescript
// plugins/c4-common/src/api/C4Api.ts
import { createApiRef } from '@backstage/core-plugin-api';
import { C4Diff, C4Snapshot, C4View, C4ViewModel, C4ViewType } from '../types';

export interface C4Api {
  getViews(opts?: { level?: C4ViewType; domain?: string }): Promise<C4View[]>;
  getView(id: string): Promise<C4ViewModel>;
  getEntityViews(kind: string, namespace: string, name: string): Promise<C4View[]>;
  getLandscape(): Promise<C4ViewModel>;
  getViewHistory(id: string): Promise<C4Snapshot[]>;
  getViewDiff(id: string, from: string, to: string): Promise<C4Diff>;
  triggerSync(): Promise<{ status: string }>;
}

export const c4ApiRef = createApiRef<C4Api>({ id: 'plugin.c4.service' });
```

- [ ] **Step 3: Write failing test**

```typescript
// plugins/c4-common/src/api/C4ApiClient.test.ts
import { C4ApiClient } from './C4ApiClient';
import { DiscoveryApi, FetchApi } from '@backstage/core-plugin-api';

function mockDiscovery(): jest.Mocked<DiscoveryApi> {
  return { getBaseUrl: jest.fn().mockResolvedValue('http://localhost:7007/api/c4') } as any;
}
function mockFetch(body: unknown): jest.Mocked<FetchApi> {
  return { fetch: jest.fn().mockResolvedValue({ ok: true, json: jest.fn().mockResolvedValue(body) }) } as any;
}

describe('C4ApiClient', () => {
  it('getViews calls GET /views', async () => {
    const fetchApi = mockFetch([]);
    const client = new C4ApiClient({ discoveryApi: mockDiscovery(), fetchApi });
    await client.getViews();
    expect(fetchApi.fetch).toHaveBeenCalledWith('http://localhost:7007/api/c4/views');
  });

  it('getViews passes level param', async () => {
    const fetchApi = mockFetch([]);
    const client = new C4ApiClient({ discoveryApi: mockDiscovery(), fetchApi });
    await client.getViews({ level: 'landscape' });
    expect(fetchApi.fetch).toHaveBeenCalledWith('http://localhost:7007/api/c4/views?level=landscape');
  });

  it('getLandscape calls GET /landscape', async () => {
    const fetchApi = mockFetch({ view: {}, model: {} });
    const client = new C4ApiClient({ discoveryApi: mockDiscovery(), fetchApi });
    await client.getLandscape();
    expect(fetchApi.fetch).toHaveBeenCalledWith('http://localhost:7007/api/c4/landscape');
  });

  it('getEntityViews calls correct URL', async () => {
    const fetchApi = mockFetch([]);
    const client = new C4ApiClient({ discoveryApi: mockDiscovery(), fetchApi });
    await client.getEntityViews('system', 'default', 'my-system');
    expect(fetchApi.fetch).toHaveBeenCalledWith('http://localhost:7007/api/c4/entity/system/default/my-system/views');
  });

  it('triggerSync calls POST /sync', async () => {
    const fetchApi = mockFetch({ status: 'started' });
    const client = new C4ApiClient({ discoveryApi: mockDiscovery(), fetchApi });
    await client.triggerSync();
    expect(fetchApi.fetch).toHaveBeenCalledWith('http://localhost:7007/api/c4/sync', expect.objectContaining({ method: 'POST' }));
  });
});
```

- [ ] **Step 4: Run to verify fail**

Run: `yarn workspace @fulgas/plugin-c4-common test --testPathPattern=C4ApiClient --no-coverage`

Expected: FAIL — `Cannot find module './C4ApiClient'`

- [ ] **Step 5: Implement C4ApiClient.ts**

```typescript
// plugins/c4-common/src/api/C4ApiClient.ts
import { DiscoveryApi, FetchApi } from '@backstage/core-plugin-api';
import { C4Api } from './C4Api';
import { C4Diff, C4Snapshot, C4View, C4ViewModel, C4ViewType } from '../types';

export class C4ApiClient implements C4Api {
  constructor(private readonly options: { discoveryApi: DiscoveryApi; fetchApi: FetchApi }) {}

  private async base(): Promise<string> {
    return this.options.discoveryApi.getBaseUrl('c4');
  }

  async getViews(opts?: { level?: C4ViewType; domain?: string }): Promise<C4View[]> {
    const base = await this.base();
    const params = new URLSearchParams();
    if (opts?.level) params.set('level', opts.level);
    if (opts?.domain) params.set('domain', opts.domain);
    const q = params.toString() ? `?${params}` : '';
    return (await this.options.fetchApi.fetch(`${base}/views${q}`)).json();
  }

  async getView(id: string): Promise<C4ViewModel> {
    return (await this.options.fetchApi.fetch(`${await this.base()}/views/${id}`)).json();
  }

  async getEntityViews(kind: string, namespace: string, name: string): Promise<C4View[]> {
    return (await this.options.fetchApi.fetch(`${await this.base()}/entity/${kind}/${namespace}/${name}/views`)).json();
  }

  async getLandscape(): Promise<C4ViewModel> {
    return (await this.options.fetchApi.fetch(`${await this.base()}/landscape`)).json();
  }

  async getViewHistory(id: string): Promise<C4Snapshot[]> {
    return (await this.options.fetchApi.fetch(`${await this.base()}/views/${id}/history`)).json();
  }

  async getViewDiff(id: string, from: string, to: string): Promise<C4Diff> {
    return (await this.options.fetchApi.fetch(`${await this.base()}/views/${id}/diff?from=${from}&to=${to}`)).json();
  }

  async triggerSync(): Promise<{ status: string }> {
    return (await this.options.fetchApi.fetch(`${await this.base()}/sync`, { method: 'POST' })).json();
  }
}
```

- [ ] **Step 6: Run to verify pass**

Run: `yarn workspace @fulgas/plugin-c4-common test --testPathPattern=C4ApiClient --no-coverage`

Expected: all 5 tests PASS.

---

### Task 3: Update index.ts exports

**Files:**
- Modify: `plugins/c4-common/src/index.ts`

- [ ] **Step 7: Export everything**

```typescript
// plugins/c4-common/src/index.ts
export * from './types';
export * from './api/C4Api';
export { C4ApiClient } from './api/C4ApiClient';
```
