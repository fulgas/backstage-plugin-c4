# C4 Frontend — Plan 2: Hooks

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 4 data-fetching hooks that wrap C4ApiClient calls with loading/error state.

**Architecture:** Each hook uses SWR (already in deps) to fetch from C4ApiClient via ApiRef. Returns `{ data, loading, error }`. Tested by mocking c4ApiRef with TestApiRegistry.

**Tech Stack:** TypeScript, React, SWR, @backstage/core-plugin-api, @backstage/test-utils.

**Prerequisite:** Frontend Plan 1 complete (types.ts + C4Api).

---

### Task 1: useC4Views + useEntityC4Views + useC4View + useC4History

**Files:**
- Create: `plugins/c4/src/hooks/useC4Views.ts`
- Create: `plugins/c4/src/hooks/useEntityC4Views.ts`
- Create: `plugins/c4/src/hooks/useC4View.ts`
- Create: `plugins/c4/src/hooks/useC4History.ts`
- Create: `plugins/c4/src/hooks/hooks.test.tsx`

- [ ] **Step 1: Write failing tests**

```typescript
// plugins/c4/src/hooks/hooks.test.tsx
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { TestApiRegistry, wrapInTestApp } from '@backstage/test-utils';
import { ApiProvider } from '@backstage/core-app-api';
import { c4ApiRef } from '../api/C4Api';
import { C4Api } from '../api/C4Api';
import { C4View, C4ViewModel, C4Snapshot } from '../types';
import { useC4Views } from './useC4Views';
import { useEntityC4Views } from './useEntityC4Views';
import { useC4View } from './useC4View';
import { useC4History } from './useC4History';

const sampleView: C4View = {
  id: 'v1', type: 'landscape', title: 'Landscape', entityRefs: [], relationshipIds: [], source: 'catalog',
};

const sampleViewModel: C4ViewModel = {
  view: sampleView,
  model: { persons: [], systems: [], containers: [], components: [], relationships: [], views: [] },
};

function mockApi(overrides: Partial<C4Api> = {}): C4Api {
  return {
    getViews: jest.fn().mockResolvedValue([sampleView]),
    getView: jest.fn().mockResolvedValue(sampleViewModel),
    getEntityViews: jest.fn().mockResolvedValue([sampleView]),
    getLandscape: jest.fn().mockResolvedValue(sampleViewModel),
    getViewHistory: jest.fn().mockResolvedValue([]),
    getViewDiff: jest.fn().mockResolvedValue({ added: {}, removed: {}, changed: {} }),
    triggerSync: jest.fn().mockResolvedValue({ status: 'started' }),
    ...overrides,
  };
}

function wrapper(api: C4Api) {
  const registry = TestApiRegistry.from([c4ApiRef, api]);
  return ({ children }: { children: React.ReactNode }) => (
    <ApiProvider apis={registry}>{children}</ApiProvider>
  );
}

describe('useC4Views', () => {
  it('returns views from api', async () => {
    const api = mockApi();
    const { result } = renderHook(() => useC4Views(), { wrapper: wrapper(api) });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.views).toHaveLength(1);
    expect(result.current.views![0].id).toBe('v1');
  });

  it('returns loading true initially', () => {
    const api = mockApi();
    const { result } = renderHook(() => useC4Views(), { wrapper: wrapper(api) });
    expect(result.current.loading).toBe(true);
  });
});

describe('useEntityC4Views', () => {
  it('returns views for entity ref', async () => {
    const api = mockApi();
    const { result } = renderHook(
      () => useEntityC4Views('system', 'default', 'my-system'),
      { wrapper: wrapper(api) },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.views).toHaveLength(1);
    expect(api.getEntityViews).toHaveBeenCalledWith('system', 'default', 'my-system');
  });
});

describe('useC4View', () => {
  it('returns view model', async () => {
    const api = mockApi();
    const { result } = renderHook(() => useC4View('v1'), { wrapper: wrapper(api) });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.viewModel?.view.id).toBe('v1');
  });
});

describe('useC4History', () => {
  it('returns empty snapshots', async () => {
    const api = mockApi();
    const { result } = renderHook(() => useC4History('v1'), { wrapper: wrapper(api) });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.snapshots).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn workspace @fulgas/plugin-c4 test --testPathPattern=hooks --no-coverage`

Expected: FAIL — `Cannot find module './useC4Views'`

- [ ] **Step 3: Implement hooks**

```typescript
// plugins/c4/src/hooks/useC4Views.ts
import { useApi } from '@backstage/core-plugin-api';
import useSWR from 'swr';
import { c4ApiRef } from '../api/C4Api';
import { C4View, C4ViewType } from '../types';

export function useC4Views(opts?: { level?: C4ViewType; domain?: string }): {
  views: C4View[] | undefined;
  loading: boolean;
  error: Error | undefined;
} {
  const api = useApi(c4ApiRef);
  const key = `c4-views-${opts?.level ?? ''}-${opts?.domain ?? ''}`;
  const { data, error } = useSWR(key, () => api.getViews(opts));
  return { views: data, loading: !data && !error, error };
}
```

```typescript
// plugins/c4/src/hooks/useEntityC4Views.ts
import { useApi } from '@backstage/core-plugin-api';
import useSWR from 'swr';
import { c4ApiRef } from '../api/C4Api';
import { C4View } from '../types';

export function useEntityC4Views(kind: string, namespace: string, name: string): {
  views: C4View[] | undefined;
  loading: boolean;
  error: Error | undefined;
} {
  const api = useApi(c4ApiRef);
  const { data, error } = useSWR(
    `c4-entity-views-${kind}-${namespace}-${name}`,
    () => api.getEntityViews(kind, namespace, name),
  );
  return { views: data, loading: !data && !error, error };
}
```

```typescript
// plugins/c4/src/hooks/useC4View.ts
import { useApi } from '@backstage/core-plugin-api';
import useSWR from 'swr';
import { c4ApiRef } from '../api/C4Api';
import { C4ViewModel } from '../types';

export function useC4View(id: string | undefined): {
  viewModel: C4ViewModel | undefined;
  loading: boolean;
  error: Error | undefined;
} {
  const api = useApi(c4ApiRef);
  const { data, error } = useSWR(id ? `c4-view-${id}` : null, () => api.getView(id!));
  return { viewModel: data, loading: !!id && !data && !error, error };
}
```

```typescript
// plugins/c4/src/hooks/useC4History.ts
import { useApi } from '@backstage/core-plugin-api';
import useSWR from 'swr';
import { c4ApiRef } from '../api/C4Api';
import { C4Snapshot } from '../types';

export function useC4History(viewId: string | undefined): {
  snapshots: C4Snapshot[] | undefined;
  loading: boolean;
  error: Error | undefined;
} {
  const api = useApi(c4ApiRef);
  const { data, error } = useSWR(
    viewId ? `c4-history-${viewId}` : null,
    () => api.getViewHistory(viewId!),
  );
  return { snapshots: data, loading: !!viewId && !data && !error, error };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn workspace @fulgas/plugin-c4 test --testPathPattern=hooks --no-coverage`

Expected: all 4 tests PASS.
