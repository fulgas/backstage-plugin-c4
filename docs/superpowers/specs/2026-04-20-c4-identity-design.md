# C4 Identity Improvements — Design Spec

**Date:** 2026-04-20
**Status:** Approved

## Problem

The plugin renders and lists C4 architecture diagrams but reads and feels like a generic relation graph tool:

1. **No drill-down navigation** — the core C4 UX (zoom in/out through levels) is absent. The level filter component (`C4LevelFilter`) exists but is not wired into `DiagramView`. Clicking a node does not navigate to that entity's diagram.
2. **Generic visual rendering** — Mermaid flowchart boxes with tiny italic stereotype labels lack the recognisable C4 visual identity (distinct person shapes, prominent `[Container: Spring Boot]` labels, technology on edges).
3. **Flat list page** — the main C4 page is a plain table with `Name / Kind / Type / Source` columns, giving no sense of the C4 hierarchy.

## Approach

Do everything in one coherent spec. Doing navigation first then re-wiring it to a new renderer would be duplicated effort.

---

## Design

### 1. New package — `c4-renderer-react`

A new Backstage plugin package that replaces `c4-renderer-mermaid` as the default renderer.

**Technology:** React Flow + dagre for auto-layout, pan/zoom, and interaction. React Flow is widely used in production Backstage setups and eliminates the need to implement layout and interaction from scratch.

**Custom node components:**

| Node type               | Shape                                    | Colour      |
| ----------------------- | ---------------------------------------- | ----------- |
| `PersonNode`            | Rounded rect with head+body icon above   | `#08427b`   |
| `SystemNode`            | Plain rectangle                          | `#1168bd`   |
| `ContainerNode`         | Plain rectangle                          | `#438dd5`   |
| `ExternalSystemNode`    | Plain rectangle                          | `#666`      |
| `ExternalContainerNode` | Plain rectangle                          | `#666`      |
| `BoundaryGroup`         | Dashed border group (React Flow subflow) | transparent |

Each node shows:

- **Name** in bold
- **Stereotype** on the line below: `[Person]`, `[Software System]`, `[Container: Spring Boot]`, `[Database: PostgreSQL]`, etc.

**Custom edge:** shows `description` as the label and `technology` as a secondary line below it (e.g. `calls / HTTPS`). Directional arrow.

**Navigation:** The renderer accepts an optional `onNodeClick(entityRef: string) => void` callback. When a node has a `catalogEntityRef`, clicking it fires the callback. The renderer is otherwise stateless with respect to navigation.

**Controls:** React Flow's built-in minimap (toggled via a button in the controls toolbar), zoom controls, and fit-to-screen button. The `+` / `-` / `0` keyboard shortcuts are kept.

**Legend:** An overlaid legend panel (same as today, toggleable with `L`).

**Package:** `@fulgas/plugin-c4-renderer-react`. Exports `ReactC4Renderer` implementing `C4Renderer`.

`c4-renderer-mermaid` is retained but no longer installed as the default. Users who depend on it can continue using it.

---

### 2. Interface changes in `c4-common`

#### `C4Renderer` interface

```ts
export interface C4RenderOptions {
  onNodeClick?: (entityRef: string) => void;
}

export interface C4Renderer {
  render(viewModel: C4ViewModel, options?: C4RenderOptions): React.ReactElement;
}
```

The second argument is optional — existing renderers that ignore it (including `MermaidRenderer`) continue to compile without changes.

#### `C4DiagramViewer` component

Gains an `onNodeClick` prop and passes it through to `renderer.render()`:

```tsx
<C4DiagramViewer
  viewModel={viewModel}
  renderer={renderer}
  onNodeClick={onNodeClick} // new
  loading={loading}
  error={error}
/>
```

#### `C4View` type

Gains a read-only `parentName?: string` field populated by the backend. This is needed so the list page can show the "Part of" column without fetching each view's full model.

```ts
export interface C4View {
  // ... existing fields ...
  parentName?: string; // resolved display name of parentRef entity
}
```

---

### 3. `DiagramView` — level tabs + click-to-drill

`DiagramView` (in `c4` plugin) is reworked to:

1. **Show level tabs** when the entity has views at more than one level. Uses the existing `C4LevelFilter` component. If only one level is available, no tabs are shown.
2. **Respect `?view=<id>` query param** for deep-linking to a specific view (already partially implemented; made reliable).
3. **Pass `onNodeClick`** to `C4DiagramViewer` → renderer. The handler:
   - Parses the `entityRef` to determine `kind / namespace / name`
   - Navigates to `/c4/<namespace>/<kind>/<name>`
   - Only navigates if the target entity has C4 views (avoids dead ends); if unknown, navigates anyway and lets the page show an empty state.

**Layout:** Tabs appear above the diagram canvas. A level label (e.g. `Viewing: Container diagram`) is shown inside `DiagramView` below the tabs when a view is active. This avoids lifting selected-view state up to `C4DiagramPage`.

---

### 4. `C4Page` — richer table

The main C4 page keeps the Backstage `Table` component. Changes:

**Sidebar filters** (replacing the `Select` dropdown):

- **Level** — checkboxes for Landscape / Context / Container / Component, with colour dots matching the C4 palette. Multi-select.
- **Source** — checkboxes for `catalog` / `dsl`.

**Table columns:**

| Column  | Today             | New                                                                     |
| ------- | ----------------- | ----------------------------------------------------------------------- |
| Name    | entity name       | entity name (unchanged)                                                 |
| Kind    | entity kind       | entity kind (unchanged)                                                 |
| Type    | raw `type` string | **C4 Level** — colour-coded badge                                       |
| Source  | source string     | source (unchanged)                                                      |
| Part of | _(absent)_        | **Part of** — parent domain/system name, derived from `view.parentName` |

The `Type` column renderer wraps the value in a `Chip` with background colour matching the C4 level palette.

The `Part of` column shows `—` when `parentName` is absent (landscape-level views have no parent).

Pagination, search, and sorting are unchanged.

---

### 5. Backend — `parentName` on views

The `/api/c4/views` endpoint currently returns `C4View[]`. It needs to resolve `parentRef` to a display name so the frontend doesn't need to load every view's full model.

**Change:** In `ModelStore.getViews()` (and `getEntityViews()`), for each view with a non-null `parentRef`, look up the corresponding system or domain name from the model and attach it as `parentName`.

No database migration is required — `parentRef` is already stored (migration `004_view_parent_ref`).

---

## What does not change

- All hooks (`useC4View`, `useEntityC4Views`, `useC4Views`, `useC4History`) — unchanged.
- Backend store, processors, Structurizr parser — unchanged.
- `EntityC4Card` on the catalog entity page — unchanged.
- `EntityC4Tab` — unchanged (already delegates to `DiagramView` which gains the new behaviour).
- `C4LevelFilter`, `C4HistoryTimeline` — unchanged.
- `c4-renderer-mermaid` — kept, no longer default.

---

## Out of scope

- Component-level (`component`) view rendering — the type exists in the data model but is not a focus of this work.
- Snapshot history / diff UI — deferred.
- A thumbnail/preview in the list page — deferred.
