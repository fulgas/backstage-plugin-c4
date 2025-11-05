# C4 Common — Plan 2: Hooks + Shared Components + Renderer Interface

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add hooks, renderer interface, and shared UI components to `@fulgas/plugin-c4-common`.

**Architecture:** Hooks wrap C4ApiClient with SWR. Shared components (C4DiagramViewer, C4LevelFilter, C4HistoryTimeline) used by both legacy and new frontend packages. RendererInterface is a TypeScript interface only.

**Tech Stack:** TypeScript, React, Material UI v4, SWR, @backstage/core-components.

**Prerequisite:** C4 Common Plan 1 complete.

---

### Task 1: Hooks

**Files:**
- Create: `plugins/c4-common/src/hooks/useC4Views.ts`
- Create: `plugins/c4-common/src/hooks/useEntityC4Views.ts`
- Create: `plugins/c4-common/src/hooks/useC4View.ts`
- Create: `plugins/c4-common/src/hooks/useC4History.ts`
- Create: `plugins/c4-common/src/hooks/hooks.test.tsx`

- [ ] **Step 1: Write failing tests**

```typescript
// plugins/c4-common/src/hooks/hooks.test.tsx
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { TestApiRegistry } from '@backstage/test-utils';
import { ApiProvider } from '@backstage/core-app-api';
import { c4ApiRef, C4Api } from '../api/C4Api';
import { C4View, C4ViewModel } from '../types';
import { useC4Views } from './useC4Views';
import { useEntityC4Views } from './useEntityC4Views';
import { useC4View } from './useC4View';
import { useC4History } from './useC4History';

const view: C4View = { id: 'v1', type: 'landscape', title: 'L', entityRefs: [], relationshipIds: [], source: 'catalog' };
const vm: C4ViewModel = { view, model: { persons: [], systems: [], containers: [], components: [], relationships: [], views: [] } };

function mockApi(overrides: Partial<C4Api> = {}): C4Api {
  return { getViews: jest.fn().mockResolvedValue([view]), getView: jest.fn().mockResolvedValue(vm), getEntityViews: jest.fn().mockResolvedValue([view]), getLandscape: jest.fn().mockResolvedValue(vm), getViewHistory: jest.fn().mockResolvedValue([]), getViewDiff: jest.fn().mockResolvedValue({ added: {}, removed: {}, changed: {} }), triggerSync: jest.fn().mockResolvedValue({ status: 'started' }), ...overrides };
}

function wrap(api: C4Api) {
  const reg = TestApiRegistry.from([c4ApiRef, api]);
  return ({ children }: { children: React.ReactNode }) => <ApiProvider apis={reg}>{children}</ApiProvider>;
}

describe('useC4Views', () => {
  it('returns views', async () => {
    const { result } = renderHook(() => useC4Views(), { wrapper: wrap(mockApi()) });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.views).toHaveLength(1);
  });
});

describe('useEntityC4Views', () => {
  it('calls getEntityViews with correct args', async () => {
    const api = mockApi();
    const { result } = renderHook(() => useEntityC4Views('system', 'default', 'foo'), { wrapper: wrap(api) });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(api.getEntityViews).toHaveBeenCalledWith('system', 'default', 'foo');
  });
});

describe('useC4View', () => {
  it('returns viewModel', async () => {
    const { result } = renderHook(() => useC4View('v1'), { wrapper: wrap(mockApi()) });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.viewModel?.view.id).toBe('v1');
  });
});

describe('useC4History', () => {
  it('returns empty snapshots', async () => {
    const { result } = renderHook(() => useC4History('v1'), { wrapper: wrap(mockApi()) });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.snapshots).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `yarn workspace @fulgas/plugin-c4-common test --testPathPattern=hooks --no-coverage`

Expected: FAIL — `Cannot find module './useC4Views'`

- [ ] **Step 3: Implement hooks**

```typescript
// plugins/c4-common/src/hooks/useC4Views.ts
import { useApi } from '@backstage/core-plugin-api';
import useSWR from 'swr';
import { c4ApiRef } from '../api/C4Api';
import { C4View, C4ViewType } from '../types';

export function useC4Views(opts?: { level?: C4ViewType; domain?: string }) {
  const api = useApi(c4ApiRef);
  const key = `c4-views-${opts?.level ?? ''}-${opts?.domain ?? ''}`;
  const { data, error } = useSWR(key, () => api.getViews(opts));
  return { views: data as C4View[] | undefined, loading: !data && !error, error: error as Error | undefined };
}
```

```typescript
// plugins/c4-common/src/hooks/useEntityC4Views.ts
import { useApi } from '@backstage/core-plugin-api';
import useSWR from 'swr';
import { c4ApiRef } from '../api/C4Api';
import { C4View } from '../types';

export function useEntityC4Views(kind: string, namespace: string, name: string) {
  const api = useApi(c4ApiRef);
  const { data, error } = useSWR(`c4-entity-${kind}-${namespace}-${name}`, () => api.getEntityViews(kind, namespace, name));
  return { views: data as C4View[] | undefined, loading: !data && !error, error: error as Error | undefined };
}
```

```typescript
// plugins/c4-common/src/hooks/useC4View.ts
import { useApi } from '@backstage/core-plugin-api';
import useSWR from 'swr';
import { c4ApiRef } from '../api/C4Api';
import { C4ViewModel } from '../types';

export function useC4View(id: string | undefined) {
  const api = useApi(c4ApiRef);
  const { data, error } = useSWR(id ? `c4-view-${id}` : null, () => api.getView(id!));
  return { viewModel: data as C4ViewModel | undefined, loading: !!id && !data && !error, error: error as Error | undefined };
}
```

```typescript
// plugins/c4-common/src/hooks/useC4History.ts
import { useApi } from '@backstage/core-plugin-api';
import useSWR from 'swr';
import { c4ApiRef } from '../api/C4Api';
import { C4Snapshot } from '../types';

export function useC4History(viewId: string | undefined) {
  const api = useApi(c4ApiRef);
  const { data, error } = useSWR(viewId ? `c4-history-${viewId}` : null, () => api.getViewHistory(viewId!));
  return { snapshots: data as C4Snapshot[] | undefined, loading: !!viewId && !data && !error, error: error as Error | undefined };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `yarn workspace @fulgas/plugin-c4-common test --testPathPattern=hooks --no-coverage`

Expected: all 4 tests PASS.

---

### Task 2: RendererInterface + shared components

**Files:**
- Create: `plugins/c4-common/src/renderer/RendererInterface.ts`
- Create: `plugins/c4-common/src/components/C4DiagramViewer.tsx`
- Create: `plugins/c4-common/src/components/C4LevelFilter.tsx`
- Create: `plugins/c4-common/src/components/C4HistoryTimeline.tsx`

- [ ] **Step 5: Create RendererInterface.ts**

```typescript
// plugins/c4-common/src/renderer/RendererInterface.ts
import React from 'react';
import { C4ViewModel } from '../types';

export interface C4Renderer {
  render(viewModel: C4ViewModel): React.ReactElement;
}
```

- [ ] **Step 6: Create C4DiagramViewer.tsx**

```typescript
// plugins/c4-common/src/components/C4DiagramViewer.tsx
import React from 'react';
import { ErrorPanel, Progress } from '@backstage/core-components';
import { makeStyles } from '@material-ui/core';
import { C4Renderer } from '../renderer/RendererInterface';
import { C4ViewModel } from '../types';

const useStyles = makeStyles(theme => ({
  root: { width: '100%' },
  syncInfo: { fontSize: 12, color: theme.palette.text.secondary, marginBottom: theme.spacing(1) },
}));

export function C4DiagramViewer({ viewModel, renderer, loading, error, lastSynced }: {
  viewModel: C4ViewModel | undefined;
  renderer: C4Renderer;
  loading?: boolean;
  error?: Error;
  lastSynced?: string;
}) {
  const classes = useStyles();
  if (loading) return <Progress />;
  if (error) return <ErrorPanel error={error} />;
  return (
    <div className={classes.root}>
      {lastSynced && <div className={classes.syncInfo}>Last synced: {formatAgo(lastSynced)}</div>}
      {viewModel ? renderer.render(viewModel) : null}
    </div>
  );
}

function formatAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}
```

- [ ] **Step 7: Create C4LevelFilter.tsx**

```typescript
// plugins/c4-common/src/components/C4LevelFilter.tsx
import React from 'react';
import { Tab, Tabs } from '@material-ui/core';
import { C4ViewType } from '../types';

const LEVELS: { value: C4ViewType; label: string }[] = [
  { value: 'landscape', label: 'Landscape' },
  { value: 'context', label: 'System Context' },
  { value: 'container', label: 'Container' },
  { value: 'component', label: 'Component' },
];

export function C4LevelFilter({ selected, onChange }: { selected: C4ViewType; onChange: (l: C4ViewType) => void }) {
  return (
    <Tabs value={selected} onChange={(_e, val) => onChange(val)} indicatorColor="primary" textColor="primary">
      {LEVELS.map(l => <Tab key={l.value} value={l.value} label={l.label} />)}
    </Tabs>
  );
}
```

- [ ] **Step 8: Create C4HistoryTimeline.tsx**

```typescript
// plugins/c4-common/src/components/C4HistoryTimeline.tsx
import React, { useState } from 'react';
import { Checkbox, Chip, List, ListItem, ListItemIcon, ListItemText, Typography } from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import { C4Diff, C4Snapshot } from '../types';

const useStyles = makeStyles(theme => ({
  added: { color: theme.palette.success?.main ?? '#4caf50' },
  removed: { color: theme.palette.error.main },
  changed: { color: theme.palette.warning?.main ?? '#ff9800' },
  section: { marginTop: theme.spacing(1) },
}));

export function C4HistoryTimeline({ snapshots, onDiff, diff }: {
  snapshots: C4Snapshot[];
  onDiff: (from: string, to: string) => void;
  diff?: C4Diff;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const classes = useStyles();

  function toggle(id: string) {
    setSelected(prev => {
      const next = prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id].slice(-2);
      if (next.length === 2) onDiff(next[0], next[1]);
      return next;
    });
  }

  return (
    <div>
      <Typography variant="subtitle2">Snapshot History</Typography>
      <List dense>
        {snapshots.map(s => (
          <ListItem key={s.id}>
            <ListItemIcon><Checkbox edge="start" checked={selected.includes(s.id)} onChange={() => toggle(s.id)} /></ListItemIcon>
            <ListItemText primary={new Date(s.createdAt).toLocaleString()} secondary={s.modelHash.slice(0, 8)} />
          </ListItem>
        ))}
      </List>
      {diff && (
        <div className={classes.section}>
          {(diff.added?.systems?.length ?? 0) > 0 && (
            <div><Typography variant="caption" className={classes.added}>Added</Typography>{diff.added!.systems!.map(s => <Chip key={s.id} label={s.name} size="small" style={{ margin: 2, background: '#4caf50', color: '#fff' }} />)}</div>
          )}
          {(diff.removed?.systems?.length ?? 0) > 0 && (
            <div><Typography variant="caption" className={classes.removed}>Removed</Typography>{diff.removed!.systems!.map(s => <Chip key={s.id} label={s.name} size="small" style={{ margin: 2, background: '#f44336', color: '#fff' }} />)}</div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 9: Update index.ts exports**

```typescript
// plugins/c4-common/src/index.ts
export * from './types';
export * from './api/C4Api';
export { C4ApiClient } from './api/C4ApiClient';
export { useC4Views } from './hooks/useC4Views';
export { useEntityC4Views } from './hooks/useEntityC4Views';
export { useC4View } from './hooks/useC4View';
export { useC4History } from './hooks/useC4History';
export type { C4Renderer } from './renderer/RendererInterface';
export { C4DiagramViewer } from './components/C4DiagramViewer';
export { C4LevelFilter } from './components/C4LevelFilter';
export { C4HistoryTimeline } from './components/C4HistoryTimeline';
```

- [ ] **Step 10: Verify TypeScript compiles**

Run: `yarn workspace @fulgas/plugin-c4-common tsc --noEmit`

Expected: no errors.
