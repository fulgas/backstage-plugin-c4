# Canon Migration — plugin-c4 Frontend

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace MUI Grid/Typography/makeStyles in plugin-c4 page components with @backstage/canon Flex/Box/Text.

**Prerequisite:** None (adds @backstage/canon dep to plugin-c4).

---

## Task 1: Add canon dep + update C4Page.tsx

- [ ] **Step 1:** Add `"@backstage/canon": "^0.6.0"` to the `dependencies` section of `plugins/c4/package.json`, then run `yarn install` to resolve the new dependency.

- [ ] **Step 2:** Run existing tests to confirm baseline:
  ```
  yarn workspace @fulgas/plugin-c4 test --testPathPattern=C4Page --no-coverage
  ```
  Expect: PASS.

- [ ] **Step 3:** Replace the full contents of `plugins/c4/src/components/C4Page.tsx` with the following:

  ```tsx
  import React, { useState, useEffect } from 'react';
  import { Content, Header, Page, Progress } from '@backstage/core-components';
  import { useApi } from '@backstage/core-plugin-api';
  import { Box, Flex, Text } from '@backstage/canon';
  import {
    c4ApiRef, C4DiagramViewer, C4LevelFilter, C4ViewModel, C4View, C4ViewType, useC4Views, useC4View,
  } from '@fulgas/plugin-c4-common';
  import { MermaidRenderer } from '@fulgas/plugin-c4-renderer-mermaid';

  const renderer = new MermaidRenderer();

  export function C4Page() {
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
          <Flex direction="column" gap="4">
            <Box>
              <C4LevelFilter selected={level} onChange={l => { setLevel(l); setSelectedId(undefined); }} />
            </Box>
            <Flex gap="4">
              <Box style={{ width: '25%', borderRight: '1px solid #e0e0e0', paddingRight: 16 }}>
                <Text variant="subtitle">Views</Text>
                {viewsLoading ? <Progress /> : (views ?? []).map((v: C4View) => (
                  <Box
                    key={v.id}
                    style={{ cursor: 'pointer', padding: 8, borderRadius: 4, background: selectedId === v.id ? 'rgba(0,0,0,0.08)' : undefined }}
                    onClick={() => setSelectedId(v.id)}
                  >
                    <Text variant="body">{v.title}</Text>
                  </Box>
                ))}
              </Box>
              <Box style={{ flex: 1 }}>
                <C4DiagramViewer viewModel={displayVm} renderer={renderer} loading={displayLoading} error={error} />
              </Box>
            </Flex>
          </Flex>
        </Content>
      </Page>
    );
  }
  ```

- [ ] **Step 4:** Run tests to confirm the updated component passes:
  ```
  yarn workspace @fulgas/plugin-c4 test --testPathPattern=C4Page --no-coverage
  ```
  Expect: PASS.

---

## Task 2: Update EntityC4Card.tsx

- [ ] **Step 1:** Replace the full contents of `plugins/c4/src/components/EntityC4Card.tsx` with the following (the only substantive change is replacing the `Typography` import/usage from `@material-ui/core` with `Text` from `@backstage/canon`):

  ```tsx
  import React from 'react';
  import { InfoCard } from '@backstage/core-components';
  import { useEntity } from '@backstage/plugin-catalog-react';
  import { Text } from '@backstage/canon';
  import { C4DiagramViewer, useEntityC4Views, useC4View } from '@fulgas/plugin-c4-common';
  import { MermaidRenderer } from '@fulgas/plugin-c4-renderer-mermaid';
  import { SWRConfig } from 'swr';

  const renderer = new MermaidRenderer();

  export function EntityC4Card() {
    const { entity } = useEntity();
    const { kind, metadata: { namespace = 'default', name } } = entity;
    const { views, loading } = useEntityC4Views(kind.toLowerCase(), namespace, name);
    const firstView = (views ?? [])[0];
    const { viewModel } = useC4View(firstView?.id);

    if (!loading && (!views || views.length === 0)) return null;

    return (
      <SWRConfig value={{ provider: () => new Map() }}>
        <InfoCard title="C4 Architecture">
          <div style={{ height: 200, overflow: 'hidden' }}>
            <C4DiagramViewer viewModel={viewModel} renderer={renderer} loading={loading} />
          </div>
          {!viewModel && !loading && (
            <Text variant="body">No C4 diagrams available</Text>
          )}
        </InfoCard>
      </SWRConfig>
    );
  }
  ```

- [ ] **Step 2:** Run the full plugin-c4 test suite:
  ```
  yarn workspace @fulgas/plugin-c4 test --no-coverage
  ```
  Expect: PASS.

- [ ] **Step 3:** Run TypeScript compilation check:
  ```
  yarn workspace @fulgas/plugin-c4 tsc --noEmit
  ```
  Expect: no errors.
