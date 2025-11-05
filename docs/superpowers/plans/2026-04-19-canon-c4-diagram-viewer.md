# Canon Migration — C4DiagramViewer

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove makeStyles from C4DiagramViewer.tsx, use inline styles instead.

**Architecture:** No MUI theme tokens needed — inline CSS vars suffice. No new deps.

**Prerequisite:** None.

---

## Task 1: Remove makeStyles from C4DiagramViewer

- [ ] **Step 1:** Run existing tests to confirm they pass before the change:
  ```
  yarn workspace @fulgas/plugin-c4-common test --no-coverage
  ```
  Expect: all tests PASS (there may be no `C4DiagramViewer`-specific test file; a full workspace run is sufficient).

- [ ] **Step 2:** Replace the contents of `plugins/c4-common/src/components/C4DiagramViewer.tsx` with the following:
  ```tsx
  import React from 'react';
  import { ErrorPanel, Progress } from '@backstage/core-components';
  import { C4Renderer } from '../renderer/RendererInterface';
  import { C4ViewModel } from '../types';

  export function C4DiagramViewer({ viewModel, renderer, loading, error, lastSynced }: {
    viewModel: C4ViewModel | undefined;
    renderer: C4Renderer;
    loading?: boolean;
    error?: Error;
    lastSynced?: string;
  }) {
    if (loading) return <Progress />;
    if (error) return <ErrorPanel error={error} />;
    return (
      <div style={{ width: '100%' }}>
        {lastSynced && <div style={{ fontSize: 12, color: 'var(--canon-text-secondary, #666)', marginBottom: 8 }}>Last synced: {formatAgo(lastSynced)}</div>}
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
  Changes from current:
  - Remove `import { makeStyles } from '@material-ui/core'`
  - Remove `useStyles` hook definition and `const classes = useStyles()` call
  - Replace `className={classes.root}` with `style={{ width: '100%' }}`
  - Replace `className={classes.syncInfo}` with `style={{ fontSize: 12, color: 'var(--canon-text-secondary, #666)', marginBottom: 8 }}`

- [ ] **Step 3:** Run tests again to confirm nothing regressed:
  ```
  yarn workspace @fulgas/plugin-c4-common test --no-coverage
  ```
  Expect: all tests PASS.

- [ ] **Step 4:** Run TypeScript type-check to confirm no type errors:
  ```
  yarn workspace @fulgas/plugin-c4-common tsc --noEmit
  ```
  Expect: no errors.
