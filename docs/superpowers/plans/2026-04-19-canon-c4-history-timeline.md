# Canon Migration — C4HistoryTimeline

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Typography/makeStyles in C4HistoryTimeline with @backstage/canon Text and inline styles. Keep MUI interactive components.

**Prerequisite:** None (adds @backstage/canon dep).

---

## Task 1: Add @backstage/canon dep to c4-common

- [ ] **Step 1:** Add `"@backstage/canon": "^0.6.0"` to the `dependencies` object in `plugins/c4-common/package.json`.
- [ ] **Step 2:** Run `yarn install` to install the new dependency.

## Task 2: Replace Typography/makeStyles in C4HistoryTimeline

- [ ] **Step 1:** Replace `plugins/c4-common/src/components/C4HistoryTimeline.tsx` with the following content:

  ```tsx
  import React, { useState } from 'react';
  import { Checkbox, Chip, List, ListItem, ListItemIcon, ListItemText } from '@material-ui/core';
  import { Text } from '@backstage/canon';
  import { C4Diff, C4Snapshot } from '../types';

  export function C4HistoryTimeline({ snapshots, onDiff, diff }: {
    snapshots: C4Snapshot[];
    onDiff: (from: string, to: string) => void;
    diff?: C4Diff;
  }) {
    const [selected, setSelected] = useState<string[]>([]);

    function toggle(id: string) {
      setSelected(prev => {
        const next = prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id].slice(-2);
        if (next.length === 2) onDiff(next[0], next[1]);
        return next;
      });
    }

    return (
      <div>
        <Text variant="subtitle">Snapshot History</Text>
        <List dense>
          {snapshots.map(s => (
            <ListItem key={s.id}>
              <ListItemIcon><Checkbox edge="start" checked={selected.includes(s.id)} onChange={() => toggle(s.id)} /></ListItemIcon>
              <ListItemText primary={new Date(s.createdAt).toLocaleString()} secondary={s.modelHash.slice(0, 8)} />
            </ListItem>
          ))}
        </List>
        {diff && (
          <div style={{ marginTop: 8 }}>
            {(diff.added?.systems?.length ?? 0) > 0 && (
              <div><Text variant="caption" style={{ color: '#4caf50' }}>Added</Text>{diff.added!.systems!.map(s => <Chip key={s.id} label={s.name} size="small" style={{ margin: 2, background: '#4caf50', color: '#fff' }} />)}</div>
            )}
            {(diff.removed?.systems?.length ?? 0) > 0 && (
              <div><Text variant="caption" style={{ color: '#f44336' }}>Removed</Text>{diff.removed!.systems!.map(s => <Chip key={s.id} label={s.name} size="small" style={{ margin: 2, background: '#f44336', color: '#fff' }} />)}</div>
            )}
          </div>
        )}
      </div>
    );
  }
  ```

- [ ] **Step 2:** Run `yarn workspace @fulgas/plugin-c4-common test --no-coverage` — expect PASS.
- [ ] **Step 3:** Run `yarn workspace @fulgas/plugin-c4-common tsc --noEmit` — expect no errors.
