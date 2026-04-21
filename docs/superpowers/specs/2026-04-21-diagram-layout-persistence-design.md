# Diagram Layout Persistence

**Date:** 2026-04-21  
**Status:** Approved

## Overview

Users can drag nodes in a C4 diagram to arrange them, then save the layout. All users loading the same diagram see the saved positions. A sync wipes saved positions so layouts are always consistent with the current data model.

## Decisions

| Question            | Decision                                           |
| ------------------- | -------------------------------------------------- |
| Shared or per-user? | Shared — one layout for all viewers                |
| Save mechanism      | Explicit "Save Layout" button                      |
| When sync runs      | Positions wiped; fresh ELK layout on next load     |
| Storage             | Separate `c4_node_positions` table (not JSON blob) |

## Data Model

**New migration: `003_node_positions.ts`**

```sql
CREATE TABLE c4_node_positions (
  view_id  TEXT NOT NULL,
  node_id  TEXT NOT NULL,
  x        REAL NOT NULL,
  y        REAL NOT NULL,
  PRIMARY KEY (view_id, node_id)
);
```

No FK constraint on `view_id` — positions are orphaned on view deletion and cleaned up lazily (or on sync).

**Extended `C4Diagram` type (`c4-node`):**

```ts
export interface C4Diagram {
  descriptor: C4ViewDescriptor;
  nodes: C4Node[];
  actors: C4Actor[];
  relationships: C4Relationship[];
  /** Saved node positions. Empty = no layout saved, run ELK. */
  nodePositions: Record<string, { x: number; y: number }>;
}
```

## Backend

### ModelStore additions

```ts
getNodePositions(viewId: string): Promise<Record<string, { x: number; y: number }>>
saveNodePositions(viewId: string, positions: Record<string, { x: number; y: number }>): Promise<void>
clearNodePositions(viewId: string): Promise<void>
```

`computeDiagram(viewId)` fetches positions and includes them in the returned `C4Diagram`.

`clearNodePositions` is called by sync for every view whose subject node was touched (i.e. all views belonging to the synced source).

### New endpoints

| Method   | Path                   | Description                              |
| -------- | ---------------------- | ---------------------------------------- |
| `PUT`    | `/views/:id/positions` | Replace all saved positions for a view   |
| `DELETE` | `/views/:id/positions` | Clear all saved positions (reset to ELK) |

`PUT` body: `{ positions: Record<string, { x: number; y: number }> }`

Both return `{ status: 'ok' }`.

## Frontend

### `C4Api` additions (`c4-frontend-common`)

```ts
saveNodePositions(viewId: string, positions: Record<string, { x: number; y: number }>): Promise<void>
resetNodePositions(viewId: string): Promise<void>
```

### `ReactFlowDiagram` changes (`c4-renderer-react`)

New props:

```ts
interface Props {
  diagram: C4Diagram;
  options?: C4RenderOptions;
  editMode?: boolean; // enables dragging
  onPositionsChange?: (
    positions: Record<string, { x: number; y: number }>,
  ) => void;
}
```

**Layout logic:**

```
if (diagram.nodePositions is non-empty)
  → apply saved positions directly, skip ELK
else
  → run ELK, emit positions via onPositionsChange
```

When `editMode=true`:

- `nodesDraggable={true}`
- `nodesConnectable={false}` (still)
- `elementsSelectable={false}` (still)
- `onNodeClick` disabled (no entity navigation)
- `onNodesChange` tracks dragged positions in local state

### `C4DiagramViewer` changes (`c4-frontend-common`)

Owns edit mode state and toolbar:

```
[ Level filters ]  ···  [ Edit Layout ]          ← view mode
[ Level filters ]  ···  [ Reset Layout ] [ Cancel ] [ Save Layout ]  ← edit mode
```

Behaviour:

- **Edit Layout**: enter edit mode (no backend call)
- **Cancel**: exit edit mode, discard local position changes (no backend call)
- **Save Layout**: call `api.saveNodePositions(viewId, positions)`, exit edit mode
- **Reset Layout**: call `api.resetNodePositions(viewId)`, exit edit mode, triggers diagram reload (ELK runs)

`onSettingsChange` kept as-is. `onPositionsChange` added alongside it. `C4DiagramViewer` passes both down to the renderer via `C4RenderOptions`.

### `C4RenderOptions` changes (`c4-frontend-common`)

```ts
export interface C4RenderOptions {
  onNodeClick?: (entityRef: string) => void;
  onSettingsChange?: (settings: C4ViewDisplaySettings) => void;
  editMode?: boolean;
  onPositionsChange?: (
    positions: Record<string, { x: number; y: number }>,
  ) => void;
}
```

## Data Flow

```
Load diagram
  → GET /views/:id  (includes nodePositions)
  → if nodePositions non-empty: skip ELK, apply positions
  → else: run ELK

User clicks "Edit Layout"
  → editMode = true, nodesDraggable = true

User drags nodes
  → onNodesChange → local positions state updated

User clicks "Save Layout"
  → PUT /views/:id/positions { positions }
  → editMode = false

User clicks "Reset Layout"
  → DELETE /views/:id/positions
  → editMode = false
  → re-fetch diagram → no positions → ELK runs

Sync runs
  → clearNodePositions(viewId) for all affected views
  → next load: no positions → ELK runs fresh
```

## Files Changed

| File                                                    | Change                                                                            |
| ------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `c4-node/src/types.ts`                                  | Add `nodePositions` to `C4Diagram`                                                |
| `c4-backend/src/store/migrations/003_node_positions.ts` | New migration                                                                     |
| `c4-backend/src/store/ModelStore.ts`                    | `getNodePositions`, `saveNodePositions`, `clearNodePositions`; call clear in sync |
| `c4-backend/src/router.ts`                              | `PUT /views/:id/positions`, `DELETE /views/:id/positions`                         |
| `c4-frontend-common/src/api/C4Api.ts`                   | Add `saveNodePositions`, `resetNodePositions`                                     |
| `c4-frontend-common/src/api/C4ApiClient.ts`             | Implement new API methods                                                         |
| `c4-frontend-common/src/renderer/RendererInterface.ts`  | Add `editMode`, `onPositionsChange` to `C4RenderOptions`                          |
| `c4-frontend-common/src/components/C4DiagramViewer.tsx` | Edit mode state, toolbar buttons, wire save/reset                                 |
| `c4-renderer-react/src/ReactFlowDiagram.tsx`            | Layout selection logic, `editMode` prop, position tracking                        |

## Out of Scope

- Per-user layouts
- Edge routing overrides (only node positions)
- Undo/redo
- Auto-save
