# C4 Legacy Frontend — Plan 1: plugin-c4 (Legacy)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `@fulgas/plugin-c4` for legacy Backstage apps — C4Page, EntityC4Tab, EntityC4Card using `createPlugin`.

**Architecture:** Uses `createPlugin` + `createRoutableExtension` + `createComponentExtension`. All data/UI logic imported from `@fulgas/plugin-c4-common`. Renderer injected at app level via context.

**Tech Stack:** TypeScript, React, @backstage/core-plugin-api, @backstage/plugin-catalog-react, @fulgas/plugin-c4-common.

**Prerequisite:** C4 Common Plans 1+2 complete.

---

### Task 1: Update plugin-c4 package.json deps

**Files:**
- Modify: `plugins/c4/package.json`

- [ ] **Step 1: Add c4-common dep**

Add to `dependencies` in `plugins/c4/package.json`:
```json
"@fulgas/plugin-c4-common": "^0.1.0"
```

Run: `yarn install`

---

### Task 2: C4Page

**Files:**
- Replace: `plugins/c4/src/components/C4Page.tsx`
- Create: `plugins/c4/src/components/C4Page.test.tsx`

- [ ] **Step 2: Write failing test**

```typescript
// plugins/c4/src/components/C4Page.test.tsx
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { TestApiRegistry, wrapInTestApp } from '@backstage/test-utils';
import { ApiProvider } from '@backstage/core-app-api';
import { c4ApiRef, C4Api, C4ViewModel } from '@fulgas/plugin-c4-common';
import { C4Page } from './C4Page';

jest.mock('mermaid', () => ({ initialize: jest.fn(), render: jest.fn().mockResolvedValue({ svg: '<svg />' }) }));

const emptyVm: C4ViewModel = { view: { id: 'v1', type: 'landscape', title: 'Landscape', entityRefs: [], relationshipIds: [], source: 'catalog' }, model: { persons: [], systems: [], containers: [], components: [], relationships: [], views: [] } };

function mockApi(): C4Api {
  return { getViews: jest.fn().mockResolvedValue([]), getView: jest.fn().mockResolvedValue(emptyVm), getEntityViews: jest.fn().mockResolvedValue([]), getLandscape: jest.fn().mockResolvedValue(emptyVm), getViewHistory: jest.fn().mockResolvedValue([]), getViewDiff: jest.fn().mockResolvedValue({ added: {}, removed: {}, changed: {} }), triggerSync: jest.fn().mockResolvedValue({ status: 'started' }) };
}

function renderPage(api: C4Api) {
  return render(wrapInTestApp(<ApiProvider apis={TestApiRegistry.from([c4ApiRef, api])}><C4Page /></ApiProvider>));
}

describe('C4Page', () => {
  it('renders page header', () => {
    renderPage(mockApi());
    expect(screen.getByText('C4 Architecture Diagrams')).toBeTruthy();
  });

  it('renders level filter', () => {
    renderPage(mockApi());
    expect(screen.getByText('Landscape')).toBeTruthy();
  });

  it('calls getLandscape on mount', async () => {
    const api = mockApi();
    renderPage(api);
    await waitFor(() => expect(api.getLandscape).toHaveBeenCalled());
  });
});
```

- [ ] **Step 3: Run to verify fail**

Run: `yarn workspace @fulgas/plugin-c4 test --testPathPattern=C4Page --no-coverage`

Expected: FAIL (old placeholder renders wrong content)

- [ ] **Step 4: Replace C4Page.tsx**

```typescript
// plugins/c4/src/components/C4Page.tsx
import React, { useState, useEffect } from 'react';
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

export function C4Page() {
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
```

- [ ] **Step 5: Run to verify pass**

Run: `yarn workspace @fulgas/plugin-c4 test --testPathPattern=C4Page --no-coverage`

Expected: all 3 tests PASS.

---

### Task 3: EntityC4Tab + EntityC4Card

**Files:**
- Create: `plugins/c4/src/components/EntityC4Tab.tsx`
- Create: `plugins/c4/src/components/EntityC4Card.tsx`
- Create: `plugins/c4/src/components/EntityC4Tab.test.tsx`

- [ ] **Step 6: Write failing tests**

```typescript
// plugins/c4/src/components/EntityC4Tab.test.tsx
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { TestApiRegistry, wrapInTestApp } from '@backstage/test-utils';
import { ApiProvider } from '@backstage/core-app-api';
import { EntityProvider } from '@backstage/plugin-catalog-react';
import { Entity } from '@backstage/catalog-model';
import { c4ApiRef, C4Api, C4ViewModel } from '@fulgas/plugin-c4-common';
import { EntityC4Tab } from './EntityC4Tab';
import { EntityC4Card } from './EntityC4Card';

jest.mock('mermaid', () => ({ initialize: jest.fn(), render: jest.fn().mockResolvedValue({ svg: '<svg />' }) }));

const systemEntity: Entity = { apiVersion: 'backstage.io/v1alpha1', kind: 'System', metadata: { name: 'my-system', namespace: 'default' }, spec: { owner: 'team-a' }, relations: [] };

const vm: C4ViewModel = { view: { id: 'v1', type: 'context', title: 'Context', entityRefs: [], relationshipIds: [], source: 'catalog', entityRef: 'system:default/my-system' }, model: { persons: [], systems: [], containers: [], components: [], relationships: [], views: [] } };

function mockApi(views: any[] = [vm.view]): C4Api {
  return { getViews: jest.fn().mockResolvedValue(views), getView: jest.fn().mockResolvedValue(vm), getEntityViews: jest.fn().mockResolvedValue(views), getLandscape: jest.fn().mockResolvedValue(vm), getViewHistory: jest.fn().mockResolvedValue([]), getViewDiff: jest.fn().mockResolvedValue({ added: {}, removed: {}, changed: {} }), triggerSync: jest.fn().mockResolvedValue({ status: 'started' }) };
}

function wrap(api: C4Api, entity = systemEntity) {
  return ({ children }: { children: React.ReactNode }) => (
    wrapInTestApp(<ApiProvider apis={TestApiRegistry.from([c4ApiRef, api])}><EntityProvider entity={entity}>{children}</EntityProvider></ApiProvider>)
  );
}

describe('EntityC4Tab', () => {
  it('renders auto-generated and custom tabs', async () => {
    render(<EntityC4Tab />, { wrapper: wrap(mockApi()) as any });
    await waitFor(() => expect(screen.getByText('Auto-generated')).toBeTruthy());
    expect(screen.getByText('Custom (DSL)')).toBeTruthy();
  });

  it('shows MissingAnnotationEmptyState when no DSL views', async () => {
    const catalogOnlyViews = [{ ...vm.view, source: 'catalog' }];
    render(<EntityC4Tab />, { wrapper: wrap(mockApi(catalogOnlyViews)) as any });
    await waitFor(() => expect(screen.getByText(/fulgas.io\/c4-model/i)).toBeTruthy());
  });
});

describe('EntityC4Card', () => {
  it('renders nothing when no views', async () => {
    const { container } = render(<EntityC4Card />, { wrapper: wrap(mockApi([])) as any });
    await waitFor(() => expect(container.firstChild).toBeNull());
  });

  it('renders diagram link when views exist', async () => {
    render(<EntityC4Card />, { wrapper: wrap(mockApi()) as any });
    await waitFor(() => expect(screen.getByText(/C4 Architecture/i)).toBeTruthy());
  });
});
```

- [ ] **Step 7: Run to verify fail**

Run: `yarn workspace @fulgas/plugin-c4 test --testPathPattern=EntityC4 --no-coverage`

Expected: FAIL — `Cannot find module './EntityC4Tab'`

- [ ] **Step 8: Implement EntityC4Tab.tsx**

```typescript
// plugins/c4/src/components/EntityC4Tab.tsx
import React, { useState } from 'react';
import { MissingAnnotationEmptyState } from '@backstage/core-components';
import { useEntity } from '@backstage/plugin-catalog-react';
import { Tab, Tabs } from '@material-ui/core';
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
import { useApi } from '@backstage/core-plugin-api';
import { MermaidRenderer } from '@fulgas/plugin-c4-renderer-mermaid';

const renderer = new MermaidRenderer();
const C4_ANNOTATION = 'fulgas.io/c4-model';

export function EntityC4Tab() {
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
    const result = await api.getViewDiff(activeViewId, from, to);
    setDiff(result);
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
```

- [ ] **Step 9: Implement EntityC4Card.tsx**

```typescript
// plugins/c4/src/components/EntityC4Card.tsx
import React from 'react';
import { InfoCard } from '@backstage/core-components';
import { useEntity, useRouteRef } from '@backstage/plugin-catalog-react';
import { Link, Typography } from '@material-ui/core';
import {
  C4DiagramViewer,
  useEntityC4Views,
  useC4View,
} from '@fulgas/plugin-c4-common';
import { MermaidRenderer } from '@fulgas/plugin-c4-renderer-mermaid';
import { rootRouteRef } from '../routes';

const renderer = new MermaidRenderer();

export function EntityC4Card() {
  const { entity } = useEntity();
  const { kind, metadata: { namespace = 'default', name } } = entity;
  const { views, loading } = useEntityC4Views(kind.toLowerCase(), namespace, name);
  const firstView = (views ?? [])[0];
  const { viewModel } = useC4View(firstView?.id);
  const c4Route = useRouteRef(rootRouteRef);

  if (!loading && (!views || views.length === 0)) return null;

  return (
    <InfoCard title="C4 Architecture" action={<Link href={c4Route()}>View C4 Architecture</Link>}>
      <div style={{ height: 200, overflow: 'hidden' }}>
        <C4DiagramViewer viewModel={viewModel} renderer={renderer} loading={loading} />
      </div>
      {!viewModel && !loading && (
        <Typography variant="body2" color="textSecondary">No C4 diagrams available</Typography>
      )}
    </InfoCard>
  );
}
```

- [ ] **Step 10: Run to verify pass**

Run: `yarn workspace @fulgas/plugin-c4 test --testPathPattern=EntityC4 --no-coverage`

Expected: all 4 tests PASS.

---

### Task 4: Wire up plugin.ts + index.ts + routes.ts + EntityPage.tsx

**Files:**
- Modify: `plugins/c4/src/plugin.ts`
- Modify: `plugins/c4/src/index.ts`
- Modify: `plugins/c4/src/routes.ts`
- Modify: `packages/app/src/components/catalog/EntityPage.tsx`

- [ ] **Step 11: Update routes.ts**

```typescript
// plugins/c4/src/routes.ts
import { createRouteRef } from '@backstage/core-plugin-api';

export const rootRouteRef = createRouteRef({ id: 'c4' });
export const entityC4RouteRef = createRouteRef({ id: 'c4.entity' });
```

- [ ] **Step 12: Update plugin.ts**

```typescript
// plugins/c4/src/plugin.ts
import {
  createPlugin,
  createRoutableExtension,
  createComponentExtension,
} from '@backstage/core-plugin-api';
import { rootRouteRef, entityC4RouteRef } from './routes';

export const c4Plugin = createPlugin({
  id: 'c4',
  routes: { root: rootRouteRef, entityC4: entityC4RouteRef },
});

export const C4Page = c4Plugin.provide(
  createRoutableExtension({
    name: 'C4Page',
    component: () => import('./components/C4Page').then(m => m.C4Page),
    mountPoint: rootRouteRef,
  }),
);

export const EntityC4Tab = c4Plugin.provide(
  createRoutableExtension({
    name: 'EntityC4Tab',
    component: () => import('./components/EntityC4Tab').then(m => m.EntityC4Tab),
    mountPoint: entityC4RouteRef,
  }),
);

export const EntityC4Card = c4Plugin.provide(
  createComponentExtension({
    name: 'EntityC4Card',
    component: { lazy: () => import('./components/EntityC4Card').then(m => m.EntityC4Card) },
  }),
);
```

- [ ] **Step 13: Update index.ts**

```typescript
// plugins/c4/src/index.ts
export { c4Plugin, C4Page, EntityC4Tab, EntityC4Card } from './plugin';
```

- [ ] **Step 14: Add EntityC4Tab to entity pages in EntityPage.tsx**

In `packages/app/src/components/catalog/EntityPage.tsx`:

1. Add import at top:
```typescript
import { EntityC4Tab, EntityC4Card } from '@fulgas/plugin-c4';
```

2. Add to `serviceEntityPage` before closing `</EntityLayout>`:
```typescript
<EntityLayout.Route path="/c4" title="C4 Architecture">
  <EntityC4Tab />
</EntityLayout.Route>
```

3. Add to `websiteEntityPage` before closing `</EntityLayout>`:
```typescript
<EntityLayout.Route path="/c4" title="C4 Architecture">
  <EntityC4Tab />
</EntityLayout.Route>
```

4. Add to `systemPage` before closing `</EntityLayout>`:
```typescript
<EntityLayout.Route path="/c4" title="C4 Architecture">
  <EntityC4Tab />
</EntityLayout.Route>
```

5. Add to `domainPage` before closing `</EntityLayout>`:
```typescript
<EntityLayout.Route path="/c4" title="C4 Architecture">
  <EntityC4Tab />
</EntityLayout.Route>
```

6. Add `EntityC4Card` to `overviewContent` Grid:
```typescript
<Grid item md={6} xs={12}>
  <EntityC4Card />
</Grid>
```

- [ ] **Step 15: Verify TypeScript compiles**

Run: `yarn workspace @fulgas/plugin-c4 tsc --noEmit`

Expected: no errors.
