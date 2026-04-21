# Diagram Layout Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users drag nodes in a C4 diagram, save the layout to the backend, and have the same layout restored on next load — shared across all users.

**Architecture:** New `c4_node_positions` table stores `(view_id, node_id, x, y)` rows. The backend returns saved positions as part of `GET /views/:id`. The React Flow renderer skips ELK layout and uses saved positions when they exist. `C4DiagramViewer` adds an Edit/Save/Reset/Cancel toolbar that calls new backend endpoints.

**Tech Stack:** Knex (migrations), Express (router), React Flow / Xyflow, SWR (mutate for cache invalidation), TypeScript, Jest

---

## File Map

| File                                                            | Action | Responsibility                                                                                                       |
| --------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------- |
| `plugins/c4-backend/src/store/migrations/003_node_positions.ts` | Create | DB table for node positions                                                                                          |
| `plugins/c4-backend/src/store/ModelStore.ts`                    | Modify | getNodePositions, saveNodePositions, clearNodePositions; positions in computeDiagram; cleanup in saveViewDescriptors |
| `plugins/c4-backend/src/store/ModelStore.test.ts`               | Modify | Tests for position methods                                                                                           |
| `plugins/c4-backend/src/router.ts`                              | Modify | PUT/DELETE /views/:id/positions endpoints                                                                            |
| `plugins/c4-node/src/types.ts`                                  | Modify | Add `nodePositions` to `C4Diagram`                                                                                   |
| `plugins/c4-frontend-common/src/api/C4Api.ts`                   | Modify | Add saveNodePositions, resetNodePositions                                                                            |
| `plugins/c4-frontend-common/src/api/C4ApiClient.ts`             | Modify | Implement saveNodePositions, resetNodePositions                                                                      |
| `plugins/c4-frontend-common/src/api/C4ApiClient.test.ts`        | Modify | Tests for new API methods                                                                                            |
| `plugins/c4-frontend-common/src/renderer/RendererInterface.ts`  | Modify | Add editMode, onPositionsChange to C4RenderOptions                                                                   |
| `plugins/c4-frontend-common/src/components/C4DiagramViewer.tsx` | Modify | Edit mode state, toolbar, save/reset via useApi + SWR mutate                                                         |
| `plugins/c4-renderer-react/src/ReactFlowDiagram.tsx`            | Modify | Saved-position layout path, edit mode dragging, position tracking                                                    |

---

## Task 1: DB Migration — `c4_node_positions` table

**Files:**

- Create: `plugins/c4-backend/src/store/migrations/003_node_positions.ts`

- [ ] **Step 1: Create the migration file**

```typescript
// plugins/c4-backend/src/store/migrations/003_node_positions.ts
import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('c4_node_positions', table => {
    table.text('view_id').notNullable();
    table.text('node_id').notNullable();
    table.float('x').notNullable();
    table.float('y').notNullable();
    table.primary(['view_id', 'node_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('c4_node_positions');
}
```

- [ ] **Step 2: Verify the migration is picked up by the existing test**

Run: `yarn workspace @fulgas/plugin-c4-backend test --testPathPattern ModelStore`

The `migrate()` call in the test setup runs all migrations in order. If the file is syntactically valid and exports `up`/`down`, the existing tests still pass. Expected: all existing ModelStore tests PASS.

- [ ] **Step 3: Commit**

```bash
git add plugins/c4-backend/src/store/migrations/003_node_positions.ts
git commit -m "feat: add c4_node_positions migration"
```

---

## Task 2: ModelStore — position methods

**Files:**

- Modify: `plugins/c4-backend/src/store/ModelStore.ts`
- Modify: `plugins/c4-backend/src/store/ModelStore.test.ts`

- [ ] **Step 1: Write failing tests**

Add to the bottom of `plugins/c4-backend/src/store/ModelStore.test.ts`:

```typescript
describe('node positions', () => {
  it('getNodePositions returns empty object when no positions saved', async () => {
    const knex = await databases.init('SQLITE_3');
    const store = new ModelStore(knex);
    await store.migrate();
    expect(await store.getNodePositions('view-1')).toEqual({});
  });

  it('saveNodePositions + getNodePositions round-trips positions', async () => {
    const knex = await databases.init('SQLITE_3');
    const store = new ModelStore(knex);
    await store.migrate();
    await store.saveNodePositions('view-1', {
      'node-a': { x: 100, y: 200 },
      'node-b': { x: 300, y: 400 },
    });
    const positions = await store.getNodePositions('view-1');
    expect(positions['node-a']).toEqual({ x: 100, y: 200 });
    expect(positions['node-b']).toEqual({ x: 300, y: 400 });
  });

  it('saveNodePositions replaces all existing positions for the view', async () => {
    const knex = await databases.init('SQLITE_3');
    const store = new ModelStore(knex);
    await store.migrate();
    await store.saveNodePositions('view-1', { 'node-a': { x: 1, y: 2 } });
    await store.saveNodePositions('view-1', { 'node-b': { x: 3, y: 4 } });
    const positions = await store.getNodePositions('view-1');
    expect(positions['node-a']).toBeUndefined();
    expect(positions['node-b']).toEqual({ x: 3, y: 4 });
  });

  it('clearNodePositions removes all positions for the view', async () => {
    const knex = await databases.init('SQLITE_3');
    const store = new ModelStore(knex);
    await store.migrate();
    await store.saveNodePositions('view-1', { 'node-a': { x: 1, y: 2 } });
    await store.clearNodePositions('view-1');
    expect(await store.getNodePositions('view-1')).toEqual({});
  });

  it('saveNodePositions invalidates the diagram cache', async () => {
    const knex = await databases.init('SQLITE_3');
    const store = new ModelStore(knex);
    await store.migrate();

    const domain = {
      id: 'domain:default/d',
      depth: 0,
      name: 'D',
      description: '',
      tags: [] as string[],
    };
    await store.saveModel(
      { nodes: [domain], actors: [], relationships: [] },
      'catalog',
    );
    await store.saveViewDescriptors(
      [makeDescriptor({ subjectId: 'domain:default/d' })],
      'catalog',
    );

    const first = await store.computeDiagram('view-1');
    expect(first?.nodePositions).toEqual({});

    await store.saveNodePositions('view-1', { 'node-a': { x: 10, y: 20 } });
    const second = await store.computeDiagram('view-1');
    expect(second?.nodePositions['node-a']).toEqual({ x: 10, y: 20 });
  });

  it('saveViewDescriptors clears positions for replaced views', async () => {
    const knex = await databases.init('SQLITE_3');
    const store = new ModelStore(knex);
    await store.migrate();

    await store.saveViewDescriptors([makeDescriptor()], 'catalog');
    await store.saveNodePositions('view-1', { n: { x: 1, y: 2 } });

    // Re-sync replaces the view descriptor
    await store.saveViewDescriptors([makeDescriptor()], 'catalog');
    expect(await store.getNodePositions('view-1')).toEqual({});
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `yarn workspace @fulgas/plugin-c4-backend test --testPathPattern ModelStore`

Expected: all new tests FAIL with "store.getNodePositions is not a function" or similar.

- [ ] **Step 3: Implement the position methods in ModelStore**

Add these three methods to `plugins/c4-backend/src/store/ModelStore.ts` after `updateViewSettings`:

```typescript
  async getNodePositions(viewId: string): Promise<Record<string, { x: number; y: number }>> {
    const rows = await this.db('c4_node_positions').where({ view_id: viewId });
    const result: Record<string, { x: number; y: number }> = {};
    for (const row of rows) {
      result[row.node_id] = { x: row.x, y: row.y };
    }
    return result;
  }

  async saveNodePositions(viewId: string, positions: Record<string, { x: number; y: number }>): Promise<void> {
    this.cache.delete(viewId);
    await this.db.transaction(async trx => {
      await trx('c4_node_positions').where({ view_id: viewId }).delete();
      for (const [nodeId, pos] of Object.entries(positions)) {
        await trx('c4_node_positions').insert({ view_id: viewId, node_id: nodeId, x: pos.x, y: pos.y });
      }
    });
  }

  async clearNodePositions(viewId: string): Promise<void> {
    this.cache.delete(viewId);
    await this.db('c4_node_positions').where({ view_id: viewId }).delete();
  }
```

- [ ] **Step 4: Update `computeDiagram` to include positions**

In `computeDiagram`, replace the line that creates the diagram:

```typescript
// OLD:
const diagram: C4Diagram = {
  descriptor,
  nodes,
  actors: externalActors,
  relationships,
};
// NEW:
const nodePositions = await this.getNodePositions(viewId);
const diagram: C4Diagram = {
  descriptor,
  nodes,
  actors: externalActors,
  relationships,
  nodePositions,
};
```

Note: `C4Diagram.nodePositions` doesn't exist on the type yet — that's Task 4. TypeScript will error here until Task 4 is done. If running the backend tests now, add `// @ts-ignore` temporarily, or do Task 4 first (Tasks 2 and 4 can be done in either order).

- [ ] **Step 5: Update `saveViewDescriptors` to clean up positions for replaced views**

Replace the `saveViewDescriptors` method body:

```typescript
  async saveViewDescriptors(descriptors: C4ViewDescriptor[], source: C4Source): Promise<void> {
    this.cache.clear();
    await this.db.transaction(async trx => {
      const oldRows = await trx('c4_view_descriptors').where({ source }).select('id');
      const oldIds: string[] = oldRows.map((r: any) => r.id);

      await trx('c4_view_descriptors').where({ source }).delete();

      if (oldIds.length > 0) {
        await trx('c4_node_positions').whereIn('view_id', oldIds).delete();
      }

      for (const d of descriptors) {
        await trx('c4_view_descriptors').insert({
          id: d.id,
          title: d.title,
          subject_id: d.subjectId,
          entity_ref: d.entityRef ?? null,
          source,
        });
      }
    });
  }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `yarn workspace @fulgas/plugin-c4-backend test --testPathPattern ModelStore`

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add plugins/c4-backend/src/store/ModelStore.ts plugins/c4-backend/src/store/ModelStore.test.ts
git commit -m "feat: add node position persistence to ModelStore"
```

---

## Task 3: Router — position endpoints

**Files:**

- Modify: `plugins/c4-backend/src/router.ts`

- [ ] **Step 1: Add PUT and DELETE endpoints to the router**

In `plugins/c4-backend/src/router.ts`, add these two routes after the existing `router.patch('/views/:id/settings', ...)` block:

```typescript
router.put(
  '/views/:id/positions',
  async (req: Request, res: Response, next) => {
    try {
      const positions = req.body?.positions ?? {};
      await store.saveNodePositions(req.params.id, positions);
      res.json({ status: 'ok' });
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  '/views/:id/positions',
  async (req: Request, res: Response, next) => {
    try {
      await store.clearNodePositions(req.params.id);
      res.json({ status: 'ok' });
    } catch (err) {
      next(err);
    }
  },
);
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `yarn workspace @fulgas/plugin-c4-backend tsc --noEmit`

Expected: no errors (assuming Task 4 — types — is already done).

- [ ] **Step 3: Commit**

```bash
git add plugins/c4-backend/src/router.ts
git commit -m "feat: add PUT/DELETE /views/:id/positions endpoints"
```

---

## Task 4: Types — add `nodePositions` to `C4Diagram`

**Files:**

- Modify: `plugins/c4-node/src/types.ts`

- [ ] **Step 1: Add `nodePositions` to the `C4Diagram` interface**

In `plugins/c4-node/src/types.ts`, update the `C4Diagram` interface:

```typescript
export interface C4Diagram {
  descriptor: C4ViewDescriptor;
  /** Includes subject + internal children + external neighbors. */
  nodes: C4Node[];
  /** External actors (Users/Groups) connected to internal nodes. */
  actors: C4Actor[];
  /** Only edges where both sides are present in `nodes` or `actors`. */
  relationships: C4Relationship[];
  /**
   * Saved node positions keyed by React Flow node ID (includes boundary node
   * `__boundary__<subjectId>`). Empty object means no layout is saved — use ELK.
   */
  nodePositions: Record<string, { x: number; y: number }>;
}
```

- [ ] **Step 2: Fix the hooks test fixture**

The existing `hooks.test.tsx` has a `C4Diagram` fixture without `nodePositions`. Add it:

In `plugins/c4-frontend-common/src/hooks/hooks.test.tsx`, update the `diagram` constant:

```typescript
const diagram: C4Diagram = {
  descriptor,
  nodes: [],
  actors: [],
  relationships: [],
  nodePositions: {},
};
```

- [ ] **Step 3: Verify tests pass**

Run: `yarn workspace @fulgas/plugin-c4-frontend-common test`

Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add plugins/c4-node/src/types.ts plugins/c4-frontend-common/src/hooks/hooks.test.tsx
git commit -m "feat: add nodePositions field to C4Diagram type"
```

---

## Task 5: Frontend API — saveNodePositions + resetNodePositions

**Files:**

- Modify: `plugins/c4-frontend-common/src/api/C4Api.ts`
- Modify: `plugins/c4-frontend-common/src/api/C4ApiClient.ts`
- Modify: `plugins/c4-frontend-common/src/api/C4ApiClient.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `plugins/c4-frontend-common/src/api/C4ApiClient.test.ts`:

```typescript
it('saveNodePositions calls PUT /views/:id/positions', async () => {
  const fetchApi = mockFetch({ status: 'ok' });
  const client = new C4ApiClient({ discoveryApi: mockDiscovery(), fetchApi });
  await client.saveNodePositions('v1', { 'node-a': { x: 10, y: 20 } });
  expect(fetchApi.fetch).toHaveBeenCalledWith(
    'http://localhost:7007/api/c4/views/v1/positions',
    expect.objectContaining({ method: 'PUT' }),
  );
});

it('resetNodePositions calls DELETE /views/:id/positions', async () => {
  const fetchApi = mockFetch({ status: 'ok' });
  const client = new C4ApiClient({ discoveryApi: mockDiscovery(), fetchApi });
  await client.resetNodePositions('v1');
  expect(fetchApi.fetch).toHaveBeenCalledWith(
    'http://localhost:7007/api/c4/views/v1/positions',
    expect.objectContaining({ method: 'DELETE' }),
  );
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `yarn workspace @fulgas/plugin-c4-frontend-common test --testPathPattern C4ApiClient`

Expected: FAIL — "client.saveNodePositions is not a function".

- [ ] **Step 3: Add methods to `C4Api` interface**

In `plugins/c4-frontend-common/src/api/C4Api.ts`, add after `updateViewSettings`:

```typescript
  /**
   * Persist node positions for a view. Positions are keyed by React Flow node ID.
   * Replaces any previously saved positions for the view.
   * Settings are shared across all users viewing the same diagram.
   */
  saveNodePositions(viewId: string, positions: Record<string, { x: number; y: number }>): Promise<void>;

  /**
   * Clear all saved node positions for a view, reverting to ELK auto-layout.
   */
  resetNodePositions(viewId: string): Promise<void>;
```

- [ ] **Step 4: Implement in `C4ApiClient`**

In `plugins/c4-frontend-common/src/api/C4ApiClient.ts`, add after `updateViewSettings`:

```typescript
  async saveNodePositions(viewId: string, positions: Record<string, { x: number; y: number }>): Promise<void> {
    await this.options.fetchApi.fetch(
      `${await this.base()}/views/${encodeURIComponent(viewId)}/positions`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ positions }),
      },
    );
  }

  async resetNodePositions(viewId: string): Promise<void> {
    await this.options.fetchApi.fetch(
      `${await this.base()}/views/${encodeURIComponent(viewId)}/positions`,
      { method: 'DELETE' },
    );
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `yarn workspace @fulgas/plugin-c4-frontend-common test --testPathPattern C4ApiClient`

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add plugins/c4-frontend-common/src/api/C4Api.ts plugins/c4-frontend-common/src/api/C4ApiClient.ts plugins/c4-frontend-common/src/api/C4ApiClient.test.ts
git commit -m "feat: add saveNodePositions and resetNodePositions to C4Api"
```

---

## Task 6: RendererInterface — editMode and onPositionsChange

**Files:**

- Modify: `plugins/c4-frontend-common/src/renderer/RendererInterface.ts`

- [ ] **Step 1: Add fields to `C4RenderOptions`**

Replace the contents of `plugins/c4-frontend-common/src/renderer/RendererInterface.ts`:

````typescript
import React from 'react';
import { C4Diagram, C4ViewDisplaySettings } from '../types';

/** Options passed from the viewer component to the renderer. */
export interface C4RenderOptions {
  /** Called when the user clicks a node. Receives the node's `catalogEntityRef` if set, otherwise its `id`. */
  onNodeClick?: (entityRef: string) => void;
  /**
   * Called when the user changes display settings (direction, spacing).
   * The caller is responsible for persisting these settings to the backend.
   */
  onSettingsChange?: (settings: C4ViewDisplaySettings) => void;
  /**
   * When true, node dragging is enabled and node clicks are suppressed.
   * The renderer should show a visual cue that the diagram is in edit mode.
   */
  editMode?: boolean;
  /**
   * Called whenever node positions change during drag.
   * Receives the full position map for all nodes (keyed by React Flow node ID).
   * Only called when editMode is true.
   */
  onPositionsChange?: (
    positions: Record<string, { x: number; y: number }>,
  ) => void;
}

/**
 * Interface implemented by diagram renderer packages (e.g. `c4-renderer-react`).
 *
 * A renderer receives a computed `C4Diagram` and turns it into a React element.
 * It is responsible for layout, styling, and interaction — not for data fetching.
 *
 * @example
 * ```tsx
 * // In a renderer package:
 * export const myRenderer: C4Renderer = {
 *   render(diagram, options) {
 *     return <MyDiagramCanvas diagram={diagram} onNodeClick={options?.onNodeClick} />;
 *   },
 * };
 * ```
 */
export interface C4Renderer {
  render(diagram: C4Diagram, options?: C4RenderOptions): React.ReactElement;
}
````

- [ ] **Step 2: Verify TypeScript compiles**

Run: `yarn workspace @fulgas/plugin-c4-frontend-common tsc --noEmit`

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add plugins/c4-frontend-common/src/renderer/RendererInterface.ts
git commit -m "feat: add editMode and onPositionsChange to C4RenderOptions"
```

---

## Task 7: ReactFlowDiagram — saved-position layout + edit mode

**Files:**

- Modify: `plugins/c4-renderer-react/src/ReactFlowDiagram.tsx`

- [ ] **Step 1: Implement the updated component**

Replace the contents of `plugins/c4-renderer-react/src/ReactFlowDiagram.tsx`:

```typescript
import {
  applyNodeChanges,
  Controls,
  ReactFlow,
  type Edge,
  type EdgeTypes,
  type Node,
  type NodeChange,
  type NodeTypes,
} from '@xyflow/react';
import { useEffect, useState } from 'react';
import '@xyflow/react/dist/style.css';
import type { C4RenderOptions } from '@fulgas/plugin-c4-frontend-common';
import type { C4Diagram } from '@fulgas/plugin-c4-node';
import { ElkEdge } from './edges/ElkEdge';
import { elkLayout } from './layout/elkLayout';
import type { LayoutResult } from './layout/types';
import {
  ActorNode,
  BoundaryNode,
  ExternalNode,
  InternalNode,
} from './nodes/C4NodeTypes';

const nodeTypes: NodeTypes = {
  boundary: BoundaryNode as any,
  internal: InternalNode as any,
  external: ExternalNode as any,
  actor: ActorNode as any,
};

const edgeTypes: EdgeTypes = {
  elk: ElkEdge as any,
};

/**
 * Override node positions with saved values, clearing ELK edge sections so
 * ElkEdge falls back to the smooth-step path (which uses live node positions).
 */
function applyPositions(
  result: LayoutResult,
  positions: Record<string, { x: number; y: number }>,
): LayoutResult {
  const nodes = result.nodes.map(n => {
    const saved = positions[n.id];
    return saved ? { ...n, position: saved } : n;
  });
  const edges = result.edges.map(e => ({
    ...e,
    data: { ...(e.data as object), sections: undefined },
  }));
  return { nodes, edges };
}

interface Props {
  diagram: C4Diagram;
  options?: C4RenderOptions;
}

/** React Flow canvas for a single C4Diagram. Uses ELK for layout when no saved positions exist. */
export function ReactFlowDiagram({ diagram, options }: Props) {
  const flowState = useState<{ nodes: Node[]; edges: Edge[] } | null>(null);
  const flow = flowState[0];
  const setFlow = flowState[1];

  useEffect(() => {
    setFlow(null);
    let cancelled = false;
    elkLayout(diagram).then(result => {
      if (!cancelled) {
        const hasSaved = Object.keys(diagram.nodePositions ?? {}).length > 0;
        setFlow(
          hasSaved ? applyPositions(result, diagram.nodePositions) : result,
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [diagram]);

  const editMode = options?.editMode ?? false;

  const handleNodesChange = (changes: NodeChange[]) => {
    if (!editMode) return;
    setFlow(prev => {
      if (!prev) return prev;
      const nodes = applyNodeChanges(changes, prev.nodes);
      const positions: Record<string, { x: number; y: number }> = {};
      for (const n of nodes) positions[n.id] = n.position;
      options?.onPositionsChange?.(positions);
      return { ...prev, nodes };
    });
  };

  return (
    <div style={{ width: '100%', height: 600 }}>
      {/* Strip React Flow's default white node background */}
      <style>{`.react-flow__node { background: transparent !important; border: none !important; padding: 0 !important; box-shadow: none !important; }`}</style>
      {editMode && (
        <style>{`.react-flow__node:not([data-type="boundary"]) { cursor: grab; } .react-flow__node:not([data-type="boundary"]):active { cursor: grabbing; }`}</style>
      )}
      <ReactFlow
        nodes={flow?.nodes ?? []}
        edges={flow?.edges ?? []}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodesDraggable={editMode}
        nodesConnectable={false}
        elementsSelectable={false}
        onNodesChange={handleNodesChange}
        onNodeClick={(_e, node) => {
          if (editMode) return;
          if (!options?.onNodeClick) return;
          if (node.type === 'boundary') return;
          const entityRef = (node.data as any).entityRef ?? node.id;
          options.onNodeClick(entityRef);
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `yarn workspace @fulgas/plugin-c4-renderer-react tsc --noEmit`

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add plugins/c4-renderer-react/src/ReactFlowDiagram.tsx
git commit -m "feat: apply saved positions in ReactFlowDiagram; add edit mode dragging"
```

---

## Task 8: C4DiagramViewer — edit mode toolbar

**Files:**

- Modify: `plugins/c4-frontend-common/src/components/C4DiagramViewer.tsx`

- [ ] **Step 1: Implement the updated component**

Replace the contents of `plugins/c4-frontend-common/src/components/C4DiagramViewer.tsx`:

````typescript
import { ErrorPanel, Progress } from '@backstage/core-components';
import { useApi } from '@backstage/core-plugin-api';
import { useState } from 'react';
import { mutate } from 'swr';
import { c4ApiRef } from '../api/C4Api';
import { C4Renderer, C4RenderOptions } from '../renderer/RendererInterface';
import { C4Diagram, C4ViewDisplaySettings } from '../types';

const btnBase: React.CSSProperties = {
  border: '1px solid #555',
  borderRadius: 4,
  padding: '4px 10px',
  fontSize: 12,
  cursor: 'pointer',
  background: '#3b3b5c',
  color: '#ccc',
};

const btnPrimary: React.CSSProperties = {
  ...btnBase,
  background: '#4444aa',
  color: '#fff',
  border: 'none',
};

/**
 * Wrapper component that handles loading/error states before delegating
 * rendering to a `C4Renderer` implementation.
 *
 * Includes an Edit Layout toolbar that lets users drag nodes and save/reset
 * the layout to the backend. Saved layouts are shared across all users.
 *
 * @example
 * ```tsx
 * const { diagram, loading, error } = useC4View(descriptorId);
 * <C4DiagramViewer diagram={diagram} renderer={myRenderer} loading={loading} error={error} onNodeClick={navigateTo} />
 * ```
 */
export function C4DiagramViewer({
  diagram,
  renderer,
  loading,
  error,
  onNodeClick,
  onSettingsChange,
}: {
  diagram: C4Diagram | undefined;
  renderer: C4Renderer;
  loading?: boolean;
  error?: Error;
  onNodeClick?: C4RenderOptions['onNodeClick'];
  onSettingsChange?: (settings: C4ViewDisplaySettings) => void;
}) {
  const api = useApi(c4ApiRef);
  const editModeState = useState(false);
  const editMode = editModeState[0];
  const setEditMode = editModeState[1];

  const pendingPositionsState = useState<
    Record<string, { x: number; y: number }> | undefined
  >(undefined);
  const pendingPositions = pendingPositionsState[0];
  const setPendingPositions = pendingPositionsState[1];

  const viewId = diagram?.descriptor.id;

  const handleSaveLayout = async () => {
    if (!viewId || !pendingPositions) return;
    await api.saveNodePositions(viewId, pendingPositions);
    setEditMode(false);
    setPendingPositions(undefined);
  };

  const handleResetLayout = async () => {
    if (!viewId) return;
    await api.resetNodePositions(viewId);
    await mutate(`c4-diagram-${viewId}`);
    setEditMode(false);
    setPendingPositions(undefined);
  };

  const handleCancel = () => {
    setEditMode(false);
    setPendingPositions(undefined);
  };

  if (loading) return <Progress />;
  if (error) return <ErrorPanel error={error} />;
  return (
    <div style={{ width: '100%' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 8,
          marginBottom: 8,
        }}
      >
        {editMode ? (
          <>
            <button style={btnBase} onClick={handleResetLayout}>
              Reset Layout
            </button>
            <button style={btnBase} onClick={handleCancel}>
              Cancel
            </button>
            <button
              style={{ ...btnPrimary, opacity: pendingPositions ? 1 : 0.5 }}
              disabled={!pendingPositions}
              onClick={handleSaveLayout}
            >
              Save Layout
            </button>
          </>
        ) : (
          diagram && (
            <button style={btnBase} onClick={() => setEditMode(true)}>
              Edit Layout
            </button>
          )
        )}
      </div>
      {diagram
        ? renderer.render(diagram, {
            onNodeClick: editMode ? undefined : onNodeClick,
            onSettingsChange,
            editMode,
            onPositionsChange: editMode ? setPendingPositions : undefined,
          })
        : null}
    </div>
  );
}
````

- [ ] **Step 2: Verify TypeScript compiles**

Run: `yarn workspace @fulgas/plugin-c4-frontend-common tsc --noEmit`

Expected: no errors.

- [ ] **Step 3: Update the legacy frontend API client**

The legacy frontend has its own `C4ApiClient` at `plugins/c4-frontend-legacy/src/api/C4ApiClient.ts`. It also implements `C4Api`, so it needs the two new methods. Add them after `updateViewSettings`:

```typescript
  async saveNodePositions(viewId: string, positions: Record<string, { x: number; y: number }>): Promise<void> {
    await this.fetchApi.fetch(`${await this.base()}/views/${encodeURIComponent(viewId)}/positions`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ positions }),
    });
  }

  async resetNodePositions(viewId: string): Promise<void> {
    await this.fetchApi.fetch(`${await this.base()}/views/${encodeURIComponent(viewId)}/positions`, {
      method: 'DELETE',
    });
  }
```

- [ ] **Step 4: Run all frontend tests**

Run: `yarn workspace @fulgas/plugin-c4-frontend-common test`

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/c4-frontend-common/src/components/C4DiagramViewer.tsx plugins/c4-frontend-legacy/src/api/C4ApiClient.ts
git commit -m "feat: add edit mode toolbar to C4DiagramViewer"
```

---

## Task 9: End-to-end verification

- [ ] **Step 1: Run the full backend test suite**

Run: `yarn workspace @fulgas/plugin-c4-backend test`

Expected: all tests PASS.

- [ ] **Step 2: Run the full frontend-common test suite**

Run: `yarn workspace @fulgas/plugin-c4-frontend-common test`

Expected: all tests PASS.

- [ ] **Step 3: Run TypeScript checks across all modified packages**

```bash
yarn workspace @fulgas/plugin-c4-node tsc --noEmit
yarn workspace @fulgas/plugin-c4-backend tsc --noEmit
yarn workspace @fulgas/plugin-c4-frontend-common tsc --noEmit
yarn workspace @fulgas/plugin-c4-renderer-react tsc --noEmit
```

Expected: no errors in any package.

- [ ] **Step 4: Start the dev server and manually verify the feature**

```bash
yarn dev
```

Open Backstage in the browser. Navigate to a C4 diagram. Verify:

1. "Edit Layout" button appears in the top-right of the diagram
2. Clicking it enables node dragging (cursor changes to grab)
3. Dragging a node activates "Save Layout" button (it becomes non-disabled)
4. "Reset Layout" returns to ELK auto-layout
5. "Cancel" discards changes
6. After saving, reload the page — nodes are in the saved positions
7. After reset, reload — nodes are back to ELK layout

- [ ] **Step 5: Final commit**

```bash
git add -p  # stage any outstanding changes
git commit -m "feat: diagram layout persistence — edit, save, reset node positions"
```
