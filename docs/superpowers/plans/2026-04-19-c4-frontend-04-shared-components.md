# C4 Frontend — Plan 4: Shared Components

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build C4DiagramViewer (wraps renderer with error boundary and staleness indicator) and C4LevelFilter (tab selector for C4 levels).

**Architecture:** C4DiagramViewer uses Backstage ErrorPanel for errors, shows "Last synced: X ago" from sync status. C4LevelFilter is a controlled tab strip. Both are pure presentational components. C4HistoryTimeline shows snapshot list + diff view.

**Tech Stack:** TypeScript, React, Material UI v4, @backstage/core-components (ErrorPanel, Progress).

**Prerequisite:** Frontend Plans 1-3 complete.

---

### Task 1: C4DiagramViewer

**Files:**
- Create: `plugins/c4/src/components/C4DiagramViewer.tsx`
- Create: `plugins/c4/src/components/C4DiagramViewer.test.tsx`

- [ ] **Step 1: Write failing tests**

```typescript
// plugins/c4/src/components/C4DiagramViewer.test.tsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import { C4DiagramViewer } from './C4DiagramViewer';
import { C4ViewModel } from '../types';
import { MermaidRenderer } from '../renderer/MermaidRenderer';

jest.mock('mermaid', () => ({
  initialize: jest.fn(),
  render: jest.fn().mockResolvedValue({ svg: '<svg />' }),
}));

const sampleViewModel: C4ViewModel = {
  view: { id: 'v1', type: 'landscape', title: 'Landscape', entityRefs: [], relationshipIds: [], source: 'catalog' },
  model: { persons: [], systems: [], containers: [], components: [], relationships: [], views: [] },
};

const renderer = new MermaidRenderer();

describe('C4DiagramViewer', () => {
  it('renders diagram', () => {
    render(<C4DiagramViewer viewModel={sampleViewModel} renderer={renderer} />);
    expect(screen.getByTestId('c4-diagram')).toBeTruthy();
  });

  it('shows last synced when provided', () => {
    render(
      <C4DiagramViewer
        viewModel={sampleViewModel}
        renderer={renderer}
        lastSynced="2026-04-19T10:00:00.000Z"
      />,
    );
    expect(screen.getByText(/Last synced/i)).toBeTruthy();
  });

  it('shows error panel when error provided', () => {
    render(
      <C4DiagramViewer
        viewModel={sampleViewModel}
        renderer={renderer}
        error={new Error('Something went wrong')}
      />,
    );
    expect(screen.getByText(/Something went wrong/i)).toBeTruthy();
  });

  it('shows Progress when loading', () => {
    render(
      <C4DiagramViewer
        viewModel={undefined}
        renderer={renderer}
        loading
      />,
    );
    expect(screen.getByRole('progressbar')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn workspace @fulgas/plugin-c4 test --testPathPattern=C4DiagramViewer --no-coverage`

Expected: FAIL — `Cannot find module './C4DiagramViewer'`

- [ ] **Step 3: Implement C4DiagramViewer**

```typescript
// plugins/c4/src/components/C4DiagramViewer.tsx
import React from 'react';
import { ErrorPanel, Progress } from '@backstage/core-components';
import { makeStyles } from '@material-ui/core';
import { C4Renderer } from '../renderer/RendererInterface';
import { C4ViewModel } from '../types';

interface Props {
  viewModel: C4ViewModel | undefined;
  renderer: C4Renderer;
  loading?: boolean;
  error?: Error;
  lastSynced?: string;
}

const useStyles = makeStyles(theme => ({
  root: { width: '100%' },
  syncInfo: {
    fontSize: 12,
    color: theme.palette.text.secondary,
    marginBottom: theme.spacing(1),
  },
}));

export function C4DiagramViewer({ viewModel, renderer, loading, error, lastSynced }: Props) {
  const classes = useStyles();

  if (loading) return <Progress />;
  if (error) return <ErrorPanel error={error} />;

  return (
    <div className={classes.root}>
      {lastSynced && (
        <div className={classes.syncInfo}>
          Last synced: {formatTimeAgo(lastSynced)}
        </div>
      )}
      {viewModel ? renderer.render(viewModel) : null}
    </div>
  );
}

function formatTimeAgo(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
  const diffHours = Math.floor(diffMins / 60);
  return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `yarn workspace @fulgas/plugin-c4 test --testPathPattern=C4DiagramViewer --no-coverage`

Expected: all 4 tests PASS.

---

### Task 2: C4LevelFilter

**Files:**
- Create: `plugins/c4/src/components/C4LevelFilter.tsx`
- Create: `plugins/c4/src/components/C4LevelFilter.test.tsx`

- [ ] **Step 5: Write failing tests**

```typescript
// plugins/c4/src/components/C4LevelFilter.test.tsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { C4LevelFilter } from './C4LevelFilter';

describe('C4LevelFilter', () => {
  it('renders all 4 level options', () => {
    render(<C4LevelFilter selected="landscape" onChange={jest.fn()} />);
    expect(screen.getByText('Landscape')).toBeTruthy();
    expect(screen.getByText('System Context')).toBeTruthy();
    expect(screen.getByText('Container')).toBeTruthy();
    expect(screen.getByText('Component')).toBeTruthy();
  });

  it('calls onChange with correct level when tab clicked', () => {
    const onChange = jest.fn();
    render(<C4LevelFilter selected="landscape" onChange={onChange} />);
    fireEvent.click(screen.getByText('Container'));
    expect(onChange).toHaveBeenCalledWith('container');
  });

  it('highlights selected level', () => {
    render(<C4LevelFilter selected="container" onChange={jest.fn()} />);
    const containerTab = screen.getByText('Container').closest('[role="tab"]');
    expect(containerTab).toHaveAttribute('aria-selected', 'true');
  });
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `yarn workspace @fulgas/plugin-c4 test --testPathPattern=C4LevelFilter --no-coverage`

Expected: FAIL — `Cannot find module './C4LevelFilter'`

- [ ] **Step 7: Implement C4LevelFilter**

```typescript
// plugins/c4/src/components/C4LevelFilter.tsx
import React from 'react';
import { Tab, Tabs } from '@material-ui/core';
import { C4ViewType } from '../types';

const LEVELS: { value: C4ViewType; label: string }[] = [
  { value: 'landscape', label: 'Landscape' },
  { value: 'context', label: 'System Context' },
  { value: 'container', label: 'Container' },
  { value: 'component', label: 'Component' },
];

interface Props {
  selected: C4ViewType;
  onChange: (level: C4ViewType) => void;
}

export function C4LevelFilter({ selected, onChange }: Props) {
  return (
    <Tabs
      value={selected}
      onChange={(_e, val) => onChange(val as C4ViewType)}
      indicatorColor="primary"
      textColor="primary"
    >
      {LEVELS.map(level => (
        <Tab key={level.value} value={level.value} label={level.label} />
      ))}
    </Tabs>
  );
}
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `yarn workspace @fulgas/plugin-c4 test --testPathPattern=C4LevelFilter --no-coverage`

Expected: all 3 tests PASS.

---

### Task 3: C4HistoryTimeline

**Files:**
- Create: `plugins/c4/src/components/C4HistoryTimeline.tsx`
- Create: `plugins/c4/src/components/C4HistoryTimeline.test.tsx`

- [ ] **Step 9: Write failing tests**

```typescript
// plugins/c4/src/components/C4HistoryTimeline.test.tsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { C4HistoryTimeline } from './C4HistoryTimeline';
import { C4Snapshot, C4Diff } from '../types';

const snapshots: C4Snapshot[] = [
  { id: 's1', viewId: 'v1', modelHash: 'abc', createdAt: '2026-04-19T10:00:00.000Z' },
  { id: 's2', viewId: 'v1', modelHash: 'def', createdAt: '2026-04-19T09:00:00.000Z' },
];

const diff: C4Diff = {
  added: { systems: [{ id: 'new-sys', name: 'New System', description: '', tags: [] }] },
  removed: {},
  changed: {},
};

describe('C4HistoryTimeline', () => {
  it('renders snapshot list', () => {
    render(<C4HistoryTimeline snapshots={snapshots} onDiff={jest.fn()} />);
    expect(screen.getByText(/2026-04-19/)).toBeTruthy();
  });

  it('calls onDiff when two snapshots selected', () => {
    const onDiff = jest.fn();
    render(<C4HistoryTimeline snapshots={snapshots} onDiff={onDiff} />);
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[1]);
    expect(onDiff).toHaveBeenCalledWith('s1', 's2');
  });

  it('shows diff when provided', () => {
    render(<C4HistoryTimeline snapshots={snapshots} onDiff={jest.fn()} diff={diff} />);
    expect(screen.getByText(/New System/)).toBeTruthy();
    expect(screen.getByText(/Added/i)).toBeTruthy();
  });
});
```

- [ ] **Step 10: Run tests to verify they fail**

Run: `yarn workspace @fulgas/plugin-c4 test --testPathPattern=C4HistoryTimeline --no-coverage`

Expected: FAIL — `Cannot find module './C4HistoryTimeline'`

- [ ] **Step 11: Implement C4HistoryTimeline**

```typescript
// plugins/c4/src/components/C4HistoryTimeline.tsx
import React, { useState } from 'react';
import { Checkbox, Chip, List, ListItem, ListItemIcon, ListItemText, Typography } from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import { C4Diff, C4Snapshot } from '../types';

interface Props {
  snapshots: C4Snapshot[];
  onDiff: (fromId: string, toId: string) => void;
  diff?: C4Diff;
}

const useStyles = makeStyles(theme => ({
  added: { color: theme.palette.success.main },
  removed: { color: theme.palette.error.main },
  changed: { color: theme.palette.warning.main },
  section: { marginTop: theme.spacing(2) },
}));

export function C4HistoryTimeline({ snapshots, onDiff, diff }: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const classes = useStyles();

  function handleToggle(id: string) {
    setSelected(prev => {
      if (prev.includes(id)) return prev.filter(s => s !== id);
      const next = [...prev, id].slice(-2); // keep last 2
      if (next.length === 2) onDiff(next[0], next[1]);
      return next;
    });
  }

  return (
    <div>
      <Typography variant="subtitle2">Snapshot History</Typography>
      <List dense>
        {snapshots.map(snap => (
          <ListItem key={snap.id}>
            <ListItemIcon>
              <Checkbox
                edge="start"
                checked={selected.includes(snap.id)}
                onChange={() => handleToggle(snap.id)}
              />
            </ListItemIcon>
            <ListItemText primary={new Date(snap.createdAt).toLocaleString()} secondary={snap.modelHash.slice(0, 8)} />
          </ListItem>
        ))}
      </List>

      {diff && (
        <div className={classes.section}>
          {(diff.added?.systems?.length ?? 0) > 0 && (
            <div>
              <Typography variant="caption" className={classes.added}>Added</Typography>
              {diff.added!.systems!.map(s => (
                <Chip key={s.id} label={s.name} size="small" style={{ margin: 2, backgroundColor: '#4caf50', color: '#fff' }} />
              ))}
            </div>
          )}
          {(diff.removed?.systems?.length ?? 0) > 0 && (
            <div>
              <Typography variant="caption" className={classes.removed}>Removed</Typography>
              {diff.removed!.systems!.map(s => (
                <Chip key={s.id} label={s.name} size="small" style={{ margin: 2, backgroundColor: '#f44336', color: '#fff' }} />
              ))}
            </div>
          )}
          {(diff.changed?.systems?.length ?? 0) > 0 && (
            <div>
              <Typography variant="caption" className={classes.changed}>Changed</Typography>
              {diff.changed!.systems!.map(s => (
                <Chip key={s.id} label={s.name} size="small" style={{ margin: 2, backgroundColor: '#ff9800', color: '#fff' }} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 12: Run tests to verify they pass**

Run: `yarn workspace @fulgas/plugin-c4 test --testPathPattern=C4HistoryTimeline --no-coverage`

Expected: all 3 tests PASS.
