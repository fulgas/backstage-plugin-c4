# C4 Module Frontend — Plan 1: plugin-c4-module (New Frontend System)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `@fulgas/plugin-c4-module` for new Backstage frontend system — declarative extensions using `@backstage/frontend-plugin-api`.

**Architecture:** Uses `createFrontendPlugin` + `createPageExtension` + `createEntityContentExtension` + `createEntityCardExtension`. Extensions are self-contained. App adds the plugin with a single import — no manual route or EntityPage wiring needed.

**Tech Stack:** TypeScript, React, @backstage/frontend-plugin-api, @backstage/plugin-catalog-react, @fulgas/plugin-c4-common, @fulgas/plugin-c4-renderer-mermaid.

**Prerequisite:** C4 Common Plans 1+2, Mermaid Renderer Plan, Backstage upgrade (Plan 0) all complete.

---

### Task 1: C4PageExtension

**Files:**
- Create: `plugins/c4-module/src/extensions/C4PageExtension.tsx`
- Create: `plugins/c4-module/src/extensions/C4PageExtension.test.tsx`

- [ ] **Step 1: Write failing test**

```typescript
// plugins/c4-module/src/extensions/C4PageExtension.test.tsx
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { TestApiRegistry, wrapInTestApp } from '@backstage/test-utils';
import { ApiProvider } from '@backstage/core-app-api';
import { c4ApiRef, C4Api, C4ViewModel } from '@fulgas/plugin-c4-common';
import { C4PageContent } from './C4PageExtension';

jest.mock('mermaid', () => ({ initialize: jest.fn(), render: jest.fn().mockResolvedValue({ svg: '<svg />' }) }));

const vm: C4ViewModel = { view: { id: 'v1', type: 'landscape', title: 'L', entityRefs: [], relationshipIds: [], source: 'catalog' }, model: { persons: [], systems: [], containers: [], components: [], relationships: [], views: [] } };

function mockApi(): C4Api {
  return { getViews: jest.fn().mockResolvedValue([]), getView: jest.fn().mockResolvedValue(vm), getEntityViews: jest.fn().mockResolvedValue([]), getLandscape: jest.fn().mockResolvedValue(vm), getViewHistory: jest.fn().mockResolvedValue([]), getViewDiff: jest.fn().mockResolvedValue({ added: {}, removed: {}, changed: {} }), triggerSync: jest.fn().mockResolvedValue({ status: 'started' }) };
}

describe('C4PageContent', () => {
  it('renders C4 Architecture Diagrams header', () => {
    render(wrapInTestApp(<ApiProvider apis={TestApiRegistry.from([c4ApiRef, mockApi()])}><C4PageContent /></ApiProvider>));
    expect(screen.getByText('C4 Architecture Diagrams')).toBeTruthy();
  });

  it('renders level filter', () => {
    render(wrapInTestApp(<ApiProvider apis={TestApiRegistry.from([c4ApiRef, mockApi()])}><C4PageContent /></ApiProvider>));
    expect(screen.getByText('Landscape')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `yarn workspace @fulgas/plugin-c4-module test --testPathPattern=C4PageExtension --no-coverage`

Expected: FAIL — `Cannot find module './C4PageExtension'`

- [ ] **Step 3: Implement C4PageExtension.tsx**

```typescript
// plugins/c4-module/src/extensions/C4PageExtension.tsx
import React, { useState, useEffect } from 'react';
import { createPageExtension } from '@backstage/frontend-plugin-api';
import { Content, Header, Page, Progress } from '@backstage/core-components';
import { useApi } from '@backstage/core-plugin-api';
import { Grid, Typography, makeStyles } from '@material-ui/core';
import {
  c4ApiRef,
  C4DiagramViewer,
  C4LevelFilter,
  C4ViewModel,
  C4View,
  C4ViewType,
  useC4Views,
  useC4View,
} from '@fulgas/plugin-c4-common';
import { MermaidRenderer } from '@fulgas/plugin-c4-renderer-mermaid';

const renderer = new MermaidRenderer();

const useStyles = makeStyles(theme => ({
  sidebar: { borderRight: `1px solid ${theme.palette.divider}`, paddingRight: theme.spacing(2) },
  viewItem: { cursor: 'pointer', padding: theme.spacing(1), borderRadius: 4, '&:hover': { background: theme.palette.action.hover } },
  selected: { background: theme.palette.action.selected },
}));

export function C4PageContent() {
  const classes = useStyles();
  const api = useApi(c4ApiRef);
  const [level, setLevel] = useState<C4ViewType>('landscape');
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [landscapeVm, setLandscapeVm] = useState<C4ViewModel | undefined>(undefined);
  const [landscapeLoading, setLandscapeLoading] = useState(true);
  const { views, loading: viewsLoading } = useC4Views({ level });
  const { viewModel, loading: vmLoading, error } = useC4View(selectedId);

  useEffect(() => {
    api.getLandscape()
      .then(vm => { setLandscapeVm(vm); setLandscapeLoading(false); })
      .catch(() => setLandscapeLoading(false));
  }, [api]);

  const displayVm = selectedId ? viewModel : landscapeVm;
  const displayLoading = selectedId ? vmLoading : landscapeLoading;

  return (
    <Page themeId="tool">
      <Header title="C4 Architecture Diagrams" />
      <Content>
        <Grid container spacing={2}>
          <Grid item xs={12}>
            <C4LevelFilter selected={level} onChange={l => { setLevel(l); setSelectedId(undefined); }} />
          </Grid>
          <Grid item xs={3} className={classes.sidebar}>
            <Typography variant="subtitle2">Views</Typography>
            {viewsLoading ? <Progress /> : (views ?? []).map((v: C4View) => (
              <div key={v.id} className={`${classes.viewItem} ${selectedId === v.id ? classes.selected : ''}`} onClick={() => setSelectedId(v.id)}>
                <Typography variant="body2">{v.title}</Typography>
              </div>
            ))}
          </Grid>
          <Grid item xs={9}>
            <C4DiagramViewer viewModel={displayVm} renderer={renderer} loading={displayLoading} error={error} />
          </Grid>
        </Grid>
      </Content>
    </Page>
  );
}

export const C4PageExtension = createPageExtension({
  defaultPath: '/c4',
  loader: async () => ({ default: C4PageContent }),
});
```

- [ ] **Step 4: Run to verify pass**

Run: `yarn workspace @fulgas/plugin-c4-module test --testPathPattern=C4PageExtension --no-coverage`

Expected: both tests PASS.

---

### Task 2: EntityC4TabExtension + EntityC4CardExtension

**Files:**
- Create: `plugins/c4-module/src/extensions/EntityC4TabExtension.tsx`
- Create: `plugins/c4-module/src/extensions/EntityC4CardExtension.tsx`
- Create: `plugins/c4-module/src/extensions/EntityC4Extensions.test.tsx`

- [ ] **Step 5: Write failing tests**

```typescript
// plugins/c4-module/src/extensions/EntityC4Extensions.test.tsx
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { TestApiRegistry, wrapInTestApp } from '@backstage/test-utils';
import { ApiProvider } from '@backstage/core-app-api';
import { EntityProvider } from '@backstage/plugin-catalog-react';
import { Entity } from '@backstage/catalog-model';
import { c4ApiRef, C4Api, C4ViewModel } from '@fulgas/plugin-c4-common';
import { EntityC4TabContent } from './EntityC4TabExtension';
import { EntityC4CardContent } from './EntityC4CardExtension';

jest.mock('mermaid', () => ({ initialize: jest.fn(), render: jest.fn().mockResolvedValue({ svg: '<svg />' }) }));

const entity: Entity = { apiVersion: 'backstage.io/v1alpha1', kind: 'System', metadata: { name: 'my-system', namespace: 'default' }, spec: { owner: 'team-a' }, relations: [] };
const vm: C4ViewModel = { view: { id: 'v1', type: 'context', title: 'Context', entityRefs: [], relationshipIds: [], source: 'catalog', entityRef: 'system:default/my-system' }, model: { persons: [], systems: [], containers: [], components: [], relationships: [], views: [] } };

function mockApi(views: any[] = [vm.view]): C4Api {
  return { getViews: jest.fn().mockResolvedValue(views), getView: jest.fn().mockResolvedValue(vm), getEntityViews: jest.fn().mockResolvedValue(views), getLandscape: jest.fn().mockResolvedValue(vm), getViewHistory: jest.fn().mockResolvedValue([]), getViewDiff: jest.fn().mockResolvedValue({ added: {}, removed: {}, changed: {} }), triggerSync: jest.fn().mockResolvedValue({ status: 'started' }) };
}

function wrap(api: C4Api) {
  return ({ children }: { children: React.ReactNode }) => (
    wrapInTestApp(<ApiProvider apis={TestApiRegistry.from([c4ApiRef, api])}><EntityProvider entity={entity}>{children}</EntityProvider></ApiProvider>)
  );
}

describe('EntityC4TabContent', () => {
  it('renders Auto-generated tab', async () => {
    render(<EntityC4TabContent />, { wrapper: wrap(mockApi()) as any });
    await waitFor(() => expect(screen.getByText('Auto-generated')).toBeTruthy());
  });

  it('shows annotation hint when no DSL views', async () => {
    render(<EntityC4TabContent />, { wrapper: wrap(mockApi([{ ...vm.view, source: 'catalog' }])) as any });
    await waitFor(() => expect(screen.getByText(/fulgas.io\/c4-model/i)).toBeTruthy());
  });
});

describe('EntityC4CardContent', () => {
  it('returns null when no views', async () => {
    const { container } = render(<EntityC4CardContent />, { wrapper: wrap(mockApi([])) as any });
    await waitFor(() => expect(container.firstChild).toBeNull());
  });

  it('renders card with link when views exist', async () => {
    render(<EntityC4CardContent />, { wrapper: wrap(mockApi()) as any });
    await waitFor(() => expect(screen.getByText(/C4 Architecture/i)).toBeTruthy());
  });
});
```

- [ ] **Step 6: Run to verify fail**

Run: `yarn workspace @fulgas/plugin-c4-module test --testPathPattern=EntityC4Extensions --no-coverage`

Expected: FAIL — `Cannot find module './EntityC4TabExtension'`

- [ ] **Step 7: Implement EntityC4TabExtension.tsx**

```typescript
// plugins/c4-module/src/extensions/EntityC4TabExtension.tsx
import React, { useState } from 'react';
import { createEntityContentExtension } from '@backstage/frontend-plugin-api';
import { MissingAnnotationEmptyState } from '@backstage/core-components';
import { useEntity } from '@backstage/plugin-catalog-react';
import { Tab, Tabs } from '@material-ui/core';
import { useApi } from '@backstage/core-plugin-api';
import {
  C4DiagramViewer,
  C4HistoryTimeline,
  C4Source,
  C4Diff,
  useEntityC4Views,
  useC4View,
  useC4History,
  c4ApiRef,
} from '@fulgas/plugin-c4-common';
import { MermaidRenderer } from '@fulgas/plugin-c4-renderer-mermaid';

const renderer = new MermaidRenderer();
const C4_ANNOTATION = 'fulgas.io/c4-model';

export function EntityC4TabContent() {
  const { entity } = useEntity();
  const { kind, metadata: { namespace = 'default', name } } = entity;
  const [sourceTab, setSourceTab] = useState<C4Source>('catalog');
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [diff, setDiff] = useState<C4Diff | undefined>(undefined);
  const api = useApi(c4ApiRef);

  const { views, loading } = useEntityC4Views(kind.toLowerCase(), namespace, name);
  const catalogViews = (views ?? []).filter(v => v.source === 'catalog');
  const dslViews = (views ?? []).filter(v => v.source === 'dsl');
  const activeViews = sourceTab === 'catalog' ? catalogViews : dslViews;
  const activeViewId = selectedId ?? activeViews[0]?.id;

  const { viewModel, loading: vmLoading, error } = useC4View(activeViewId);
  const { snapshots } = useC4History(activeViewId);

  async function handleDiff(from: string, to: string) {
    if (!activeViewId) return;
    setDiff(await api.getViewDiff(activeViewId, from, to));
  }

  return (
    <div>
      <Tabs value={sourceTab} onChange={(_e, v) => { setSourceTab(v); setSelectedId(undefined); }} indicatorColor="primary" textColor="primary">
        <Tab value="catalog" label="Auto-generated" />
        <Tab value="dsl" label="Custom (DSL)" />
      </Tabs>
      {sourceTab === 'dsl' && dslViews.length === 0 ? (
        <MissingAnnotationEmptyState annotation={C4_ANNOTATION} />
      ) : (
        <>
          <C4DiagramViewer viewModel={viewModel} renderer={renderer} loading={vmLoading} error={error} />
          {snapshots && snapshots.length > 0 && (
            <C4HistoryTimeline snapshots={snapshots} onDiff={handleDiff} diff={diff} />
          )}
        </>
      )}
    </div>
  );
}

export const EntityC4TabExtension = createEntityContentExtension({
  name: 'c4-tab',
  defaultPath: '/c4',
  defaultTitle: 'C4 Architecture',
  filter: 'kind:system,kind:component,kind:domain',
  loader: async () => ({ default: EntityC4TabContent }),
});
```

- [ ] **Step 8: Implement EntityC4CardExtension.tsx**

```typescript
// plugins/c4-module/src/extensions/EntityC4CardExtension.tsx
import React from 'react';
import { createEntityCardExtension } from '@backstage/frontend-plugin-api';
import { InfoCard } from '@backstage/core-components';
import { useEntity } from '@backstage/plugin-catalog-react';
import { Typography } from '@material-ui/core';
import {
  C4DiagramViewer,
  useEntityC4Views,
  useC4View,
} from '@fulgas/plugin-c4-common';
import { MermaidRenderer } from '@fulgas/plugin-c4-renderer-mermaid';

const renderer = new MermaidRenderer();

export function EntityC4CardContent() {
  const { entity } = useEntity();
  const { kind, metadata: { namespace = 'default', name } } = entity;
  const { views, loading } = useEntityC4Views(kind.toLowerCase(), namespace, name);
  const firstView = (views ?? [])[0];
  const { viewModel } = useC4View(firstView?.id);

  if (!loading && (!views || views.length === 0)) return null;

  return (
    <InfoCard title="C4 Architecture">
      <div style={{ height: 200, overflow: 'hidden' }}>
        <C4DiagramViewer viewModel={viewModel} renderer={renderer} loading={loading} />
      </div>
      {!viewModel && !loading && (
        <Typography variant="body2" color="textSecondary">No C4 diagrams available</Typography>
      )}
    </InfoCard>
  );
}

export const EntityC4CardExtension = createEntityCardExtension({
  name: 'c4-card',
  filter: 'kind:system,kind:component,kind:domain',
  loader: async () => ({ default: EntityC4CardContent }),
});
```

- [ ] **Step 9: Run to verify pass**

Run: `yarn workspace @fulgas/plugin-c4-module test --testPathPattern=EntityC4Extensions --no-coverage`

Expected: all 4 tests PASS.

---

### Task 3: Wire up plugin.ts + index.ts

**Files:**
- Modify: `plugins/c4-module/src/index.ts`
- Create: `plugins/c4-module/src/plugin.ts`

- [ ] **Step 10: Create plugin.ts**

```typescript
// plugins/c4-module/src/plugin.ts
import { createFrontendPlugin } from '@backstage/frontend-plugin-api';
import { c4ApiRef } from '@fulgas/plugin-c4-common';
import { C4ApiClient } from '@fulgas/plugin-c4-common';
import { createApiExtension, createApiFactory, discoveryApiRef, fetchApiRef } from '@backstage/frontend-plugin-api';
import { C4PageExtension } from './extensions/C4PageExtension';
import { EntityC4TabExtension } from './extensions/EntityC4TabExtension';
import { EntityC4CardExtension } from './extensions/EntityC4CardExtension';

const c4ApiExtension = createApiExtension({
  factory: createApiFactory({
    api: c4ApiRef,
    deps: { discoveryApi: discoveryApiRef, fetchApi: fetchApiRef },
    factory: ({ discoveryApi, fetchApi }) => new C4ApiClient({ discoveryApi, fetchApi }),
  }),
});

export const c4FrontendPlugin = createFrontendPlugin({
  id: 'c4',
  extensions: [
    c4ApiExtension,
    C4PageExtension,
    EntityC4TabExtension,
    EntityC4CardExtension,
  ],
});
```

- [ ] **Step 11: Update index.ts**

```typescript
// plugins/c4-module/src/index.ts
export { c4FrontendPlugin as default } from './plugin';
export { c4FrontendPlugin } from './plugin';
```

- [ ] **Step 12: Add to app (new frontend system)**

In `packages/app/src/App.tsx` (or equivalent new frontend system entry), add:

```typescript
import c4Module from '@fulgas/plugin-c4-module';

// In createApp extensions array:
c4Module,
```

- [ ] **Step 13: Verify TypeScript compiles**

Run: `yarn workspace @fulgas/plugin-c4-module tsc --noEmit`

Expected: no errors.
