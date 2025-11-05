# C4 Frontend — Plan 5: C4Page

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder C4Page with a full explorer page — landscape view default, level filter sidebar, domain filter, click-through drill-down.

**Architecture:** C4Page uses useC4Views + getLandscape hook. Left sidebar has C4LevelFilter and domain selector. Main area renders C4DiagramViewer with MermaidRenderer. Selecting a different level re-fetches views filtered by that level.

**Tech Stack:** TypeScript, React, Material UI v4, @backstage/core-components (Page, Header, Content).

**Prerequisite:** Frontend Plans 1-4 complete.

---

### Task 1: C4Page

**Files:**
- Replace: `plugins/c4/src/components/C4Page.tsx`
- Create: `plugins/c4/src/components/C4Page.test.tsx`

- [ ] **Step 1: Write failing tests**

```typescript
// plugins/c4/src/components/C4Page.test.tsx
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TestApiRegistry, wrapInTestApp } from '@backstage/test-utils';
import { ApiProvider } from '@backstage/core-app-api';
import { c4ApiRef, C4Api } from '../api/C4Api';
import { C4Page } from './C4Page';
import { C4View, C4ViewModel } from '../types';

jest.mock('mermaid', () => ({
  initialize: jest.fn(),
  render: jest.fn().mockResolvedValue({ svg: '<svg />' }),
}));

const landscapeView: C4View = {
  id: 'v-landscape',
  type: 'landscape',
  title: 'System Landscape',
  entityRefs: [],
  relationshipIds: [],
  source: 'catalog',
};

const containerView: C4View = {
  id: 'v-container',
  type: 'container',
  title: 'My System — Containers',
  entityRefs: [],
  relationshipIds: [],
  source: 'catalog',
  entityRef: 'system:default/my-system',
};

const emptyViewModel: C4ViewModel = {
  view: landscapeView,
  model: { persons: [], systems: [], containers: [], components: [], relationships: [], views: [] },
};

function mockApi(overrides: Partial<C4Api> = {}): C4Api {
  return {
    getViews: jest.fn().mockResolvedValue([landscapeView, containerView]),
    getView: jest.fn().mockResolvedValue(emptyViewModel),
    getEntityViews: jest.fn().mockResolvedValue([]),
    getLandscape: jest.fn().mockResolvedValue(emptyViewModel),
    getViewHistory: jest.fn().mockResolvedValue([]),
    getViewDiff: jest.fn().mockResolvedValue({ added: {}, removed: {}, changed: {} }),
    triggerSync: jest.fn().mockResolvedValue({ status: 'started' }),
    ...overrides,
  };
}

function renderPage(api: C4Api) {
  const registry = TestApiRegistry.from([c4ApiRef, api]);
  return render(
    wrapInTestApp(
      <ApiProvider apis={registry}>
        <C4Page />
      </ApiProvider>,
    ),
  );
}

describe('C4Page', () => {
  it('renders page header', async () => {
    renderPage(mockApi());
    expect(screen.getByText('C4 Architecture Diagrams')).toBeTruthy();
  });

  it('renders level filter tabs', async () => {
    renderPage(mockApi());
    expect(screen.getByText('Landscape')).toBeTruthy();
    expect(screen.getByText('Container')).toBeTruthy();
  });

  it('loads landscape view by default', async () => {
    const api = mockApi();
    renderPage(api);
    await waitFor(() => expect(api.getLandscape).toHaveBeenCalled());
  });

  it('fetches filtered views when level changes', async () => {
    const api = mockApi();
    renderPage(api);
    await waitFor(() => screen.getByText('Container'));
    fireEvent.click(screen.getByText('Container'));
    await waitFor(() =>
      expect(api.getViews).toHaveBeenCalledWith(expect.objectContaining({ level: 'container' })),
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn workspace @fulgas/plugin-c4 test --testPathPattern=C4Page --no-coverage`

Expected: tests import C4Page but see old placeholder — header assertion may pass but level filter assertions fail.

- [ ] **Step 3: Replace C4Page.tsx**

```typescript
// plugins/c4/src/components/C4Page.tsx
import React, { useState } from 'react';
import { Content, Header, Page, Progress } from '@backstage/core-components';
import { useApi } from '@backstage/core-plugin-api';
import { Grid, Typography, makeStyles } from '@material-ui/core';
import { c4ApiRef } from '../api/C4Api';
import { C4DiagramViewer } from './C4DiagramViewer';
import { C4LevelFilter } from './C4LevelFilter';
import { useC4Views } from '../hooks/useC4Views';
import { useC4View } from '../hooks/useC4View';
import { MermaidRenderer } from '../renderer/MermaidRenderer';
import { C4View, C4ViewType } from '../types';

const renderer = new MermaidRenderer();

const useStyles = makeStyles(theme => ({
  sidebar: {
    borderRight: `1px solid ${theme.palette.divider}`,
    paddingRight: theme.spacing(2),
    minHeight: 400,
  },
  viewList: { marginTop: theme.spacing(2) },
  viewItem: {
    cursor: 'pointer',
    padding: theme.spacing(1),
    borderRadius: 4,
    '&:hover': { background: theme.palette.action.hover },
  },
  selected: { background: theme.palette.action.selected },
}));

export function C4Page() {
  const classes = useStyles();
  const api = useApi(c4ApiRef);
  const [level, setLevel] = useState<C4ViewType>('landscape');
  const [selectedViewId, setSelectedViewId] = useState<string | undefined>(undefined);

  const { views, loading: viewsLoading } = useC4Views({ level });
  const { viewModel, loading: vmLoading, error } = useC4View(selectedViewId);

  // Load landscape by default on mount
  const [landscapeVm, setLandscapeVm] = React.useState<any>(undefined);
  const [landscapeLoading, setLandscapeLoading] = React.useState(true);

  React.useEffect(() => {
    api.getLandscape().then(vm => {
      setLandscapeVm(vm);
      setLandscapeLoading(false);
    }).catch(() => setLandscapeLoading(false));
  }, [api]);

  const displayVm = selectedViewId ? viewModel : landscapeVm;
  const displayLoading = selectedViewId ? vmLoading : landscapeLoading;

  return (
    <Page themeId="tool">
      <Header title="C4 Architecture Diagrams" />
      <Content>
        <Grid container spacing={2}>
          <Grid item xs={12}>
            <C4LevelFilter selected={level} onChange={l => { setLevel(l); setSelectedViewId(undefined); }} />
          </Grid>
          <Grid item xs={3} className={classes.sidebar}>
            <Typography variant="subtitle2">Views</Typography>
            {viewsLoading ? (
              <Progress />
            ) : (
              <div className={classes.viewList}>
                {(views ?? []).map((v: C4View) => (
                  <div
                    key={v.id}
                    className={`${classes.viewItem} ${selectedViewId === v.id ? classes.selected : ''}`}
                    onClick={() => setSelectedViewId(v.id)}
                  >
                    <Typography variant="body2">{v.title}</Typography>
                  </div>
                ))}
              </div>
            )}
          </Grid>
          <Grid item xs={9}>
            <C4DiagramViewer
              viewModel={displayVm}
              renderer={renderer}
              loading={displayLoading}
              error={error}
            />
          </Grid>
        </Grid>
      </Content>
    </Page>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn workspace @fulgas/plugin-c4 test --testPathPattern=C4Page --no-coverage`

Expected: all 4 tests PASS.
