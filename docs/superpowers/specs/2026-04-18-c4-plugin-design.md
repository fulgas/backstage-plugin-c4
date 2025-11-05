# C4 Backstage Plugin — Design Spec

## Overview

A Backstage plugin that renders C4 architecture diagrams from two sources: auto-generated from Backstage catalog relationships and manually authored Structurizr DSL files. Targets both platform engineers (org-wide views) and individual teams (per-service diagrams).

## C4 Levels

The plugin supports four C4 levels (no Code level — too granular for Backstage):

- **Landscape** — all systems across the org, grouped by domain
- **System Context** — a single system and its external dependencies/users
- **Container** — internals of a system (services, databases, frontends)
- **Component** — internals of a container (modules, classes)

## Data Sources

### 1. Catalog Auto-Generation

Derives C4 diagrams from existing Backstage catalog relationships:

| Catalog Relationship | C4 Mapping |
|---|---|
| Domain → Systems | Landscape diagram |
| System → Components | Container diagram |
| Component → Component (dependsOn) | Component diagram |
| Component → API (providesApi/consumesApi) | Connections between containers |
| Component → Group (ownedBy) | Person/team boxes on diagrams |

All relationship types are auto-generated from day one.

### 2. Structurizr DSL Files

Teams can author detailed C4 models using Structurizr DSL:

```
workspace {
    model {
        user = person "User" "A customer"
        softwareSystem = softwareSystem "My System" {
            webapp = container "Web App" "React frontend" "TypeScript"
            api = container "API" "REST API" "Node.js"
            db = container "Database" "Stores data" "PostgreSQL"
        }
        user -> webapp "Uses"
        webapp -> api "Calls"
        api -> db "Reads/writes"
    }
    views {
        systemContext softwareSystem {
            include *
            autolayout lr
        }
        container softwareSystem {
            include *
            autolayout lr
        }
    }
}
```

### DSL Discovery

Two mechanisms, in priority order:

1. **Catalog annotation** — `fulgas.io/c4-model: ./docs/c4-model.dsl` in `catalog-info.yaml`
2. **Convention fallback** — plugin looks for `c4-model.dsl` at repository root

### Source Coexistence

When both sources exist for an entity, they appear as **separate tabs** — "Auto-generated" and "Custom (DSL)". No merging. Users see both views independently.

## Data Model

Canonical model stored in the database. Both sources normalize into this:

```typescript
C4Person       { id, name, description, tags }
C4System       { id, name, description, tags, catalogEntityRef? }
C4Container    { id, systemId, name, description, technology, tags, catalogEntityRef? }
C4Component    { id, containerId, name, description, technology, tags, catalogEntityRef? }

C4Relationship { id, sourceId, targetId, description, technology, tags }

C4View         { id, type: landscape|context|container|component,
                 title, entityRefs[], relationshipRefs[],
                 source: 'catalog'|'dsl', entityRef? }

C4Snapshot     { id, viewId, modelHash, data (JSON), createdAt }
```

`catalogEntityRef` links C4 elements back to Backstage entities. `C4Snapshot` enables history tracking and diffing.

## Backend Architecture

Backend-driven model: backend owns all data processing, frontend only renders.

### Processors

- **CatalogProcessor** — queries Catalog API for all entities, maps relationships to C4 elements and relationships, runs on configurable schedule
- **DSLProcessor** — reads `fulgas.io/c4-model` annotation from catalog entities, fetches DSL files via Backstage SCM integration (`@backstage/integration`), parses Structurizr DSL into C4 model using `structurizr-parser` (npm), falls back to `c4-model.dsl` at repo root

Both processors run independently on a schedule via Backstage TaskScheduler.

### Model Store

- Knex-based DB layer using Backstage DatabaseManager (SQLite for dev, Postgres for prod)
- Snapshots on every sync for history tracking
- Hash-based change detection — skip writes when model unchanged
- Configurable max snapshots per view (oldest pruned)

### REST API

| Endpoint | Description |
|---|---|
| `GET /views` | List all views, filterable by level/domain |
| `GET /views/:id` | Single view with full model data |
| `GET /entity/:kind/:namespace/:name/views` | All views for a catalog entity |
| `GET /landscape` | Org-wide landscape view |
| `GET /views/:id/history` | Snapshot history for a view |
| `GET /views/:id/diff?from=<snapshotId>&to=<snapshotId>` | Compare two snapshots, returns added/removed/changed elements |
| `POST /sync` | Trigger manual re-sync |
| `GET /health` | Processor status and last sync time |

### File Structure

```
plugins/c4-backend/src/
├── index.ts                  (plugin entry)
├── processors/
│   ├── CatalogProcessor.ts   (catalog → C4 model)
│   └── DSLProcessor.ts       (DSL files → C4 model)
├── store/
│   ├── ModelStore.ts          (DB operations)
│   └── migrations/            (Knex migrations)
├── router.ts                  (REST API)
└── types.ts                   (C4 data model types)
```

## Plugin Package Structure

The frontend is split across multiple packages for flexibility — teams install only what they need:

| Package | Role |
|---|---|
| `@fulgas/plugin-c4-common` | Shared: types, C4Api ref+client, hooks, renderer interface, shared components |
| `@fulgas/plugin-c4` | Legacy frontend: `createPlugin` + JSX entity page wiring (Backstage < 1.30) |
| `@fulgas/plugin-c4-module` | New frontend system: `createFrontendPlugin` + declarative extensions (Backstage ≥ 1.30) |
| `@fulgas/plugin-c4-backend` | Backend (unchanged) |
| `@fulgas/plugin-c4-renderer-mermaid` | Mermaid renderer — separate package, opt-in |

Backstage must be upgraded to latest before using `plugin-c4-module`.

## Frontend Architecture

### `@fulgas/plugin-c4-common`

Shared across both legacy and new frontend system.

**API Client:** `C4ApiClient` registered as Backstage ApiRef (`plugin.c4.service`). Uses `discoveryApi` to resolve backend base URL. Typed client for all backend REST endpoints.

**Hooks:**

| Hook | Purpose |
|---|---|
| `useC4Views()` | List all views, filter by level/domain |
| `useEntityC4Views(kind, namespace, name)` | Views for a specific catalog entity |
| `useC4View(viewId)` | Single view with full model data |
| `useC4History(viewId)` | Snapshots for history view |

**Renderer Interface:**

```typescript
interface C4Renderer {
  render(viewModel: C4ViewModel): React.ReactElement;
}
```

Renderer is injected — no hard dependency on any renderer package.

**Shared Components:** `C4DiagramViewer`, `C4LevelFilter`, `C4HistoryTimeline` — used by both legacy and new frontend packages.

**File Structure:**
```
plugins/c4-common/src/
├── index.ts
├── types.ts
├── api/
│   ├── C4Api.ts
│   └── C4ApiClient.ts
├── hooks/
│   ├── useC4Views.ts
│   ├── useEntityC4Views.ts
│   ├── useC4View.ts
│   └── useC4History.ts
├── renderer/
│   └── RendererInterface.ts
└── components/
    ├── C4DiagramViewer.tsx
    ├── C4LevelFilter.tsx
    └── C4HistoryTimeline.tsx
```

### `@fulgas/plugin-c4` (Legacy)

Targets Backstage apps using `createPlugin` + direct JSX `EntityPage.tsx` wiring.

**Exports:** `c4Plugin`, `C4Page`, `EntityC4Tab`, `EntityC4Card`

**Wiring:** App adds `<Route path="/c4" element={<C4Page />} />` and imports `EntityC4Tab`, `EntityC4Card` into `EntityPage.tsx`.

**File Structure:**
```
plugins/c4/src/
├── index.ts
├── plugin.ts        (createPlugin, extensions)
├── routes.ts
└── components/
    ├── C4Page.tsx
    ├── EntityC4Tab.tsx
    └── EntityC4Card.tsx
```

### `@fulgas/plugin-c4-module` (New Frontend System)

Targets Backstage apps using `@backstage/frontend-plugin-api` (Backstage ≥ latest).

**Exports:** `c4FrontendPlugin` — self-contained, declarative. App just adds `import('@fulgas/plugin-c4-module')` to `createApp`.

**Extensions:**
- `C4PageExtension` — `createPageExtension` at route `/c4`
- `EntityC4TabExtension` — `createEntityContentExtension` on System, Component, Domain entity pages
- `EntityC4CardExtension` — `createEntityCardExtension` on Overview tab

**File Structure:**
```
plugins/c4-module/src/
├── index.ts
├── plugin.ts        (createFrontendPlugin)
└── extensions/
    ├── C4PageExtension.tsx
    ├── EntityC4TabExtension.tsx
    └── EntityC4CardExtension.tsx
```

### `@fulgas/plugin-c4-renderer-mermaid`

Separate package. Implements `C4Renderer` interface from `plugin-c4-common` using `mermaid` npm package.

**File Structure:**
```
plugins/c4-renderer-mermaid/src/
├── index.ts
└── MermaidRenderer.tsx
```

Teams install and pass renderer instance to `C4DiagramViewer`.

## Configuration

```yaml
c4:
  schedule:
    frequency: { minutes: 5 }
    timeout: { minutes: 3 }
  dsl:
    annotation: fulgas.io/c4-model
    conventionPath: c4-model.dsl
  renderer: mermaid
  history:
    enabled: true
    maxSnapshots: 100
```

All fields optional. Sensible defaults — plugin works with zero config.

## Error Handling

Uses Backstage built-in error components (`ErrorPanel`, `ErrorBoundary`, `WarningPanel`, `MissingAnnotationEmptyState`).

Domain-specific additions:
- **DSL parse errors** — shown with line/column info via `WarningPanel`, does not block auto-generated diagrams
- **Staleness indicator** — "Last synced: X ago" when sync is delayed or failing

## Testing Strategy

- **Backend unit tests** — CatalogProcessor (mock catalog API → verify C4 model output), DSLProcessor (sample DSL files → verify parsed model), ModelStore (DB operations), Router (API response shape)
- **Frontend component tests** — each UI surface using `@backstage/test-utils`, renderer snapshot tests
- **Integration tests** — seed catalog entities → trigger sync → verify API returns correct views → verify frontend renders
