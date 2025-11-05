# C4 Model — Concepts & Design

This document explains the C4 model as implemented in this Backstage plugin: what the concepts mean, how they map to catalog entities, and why the data model is designed the way it is.

---

## What is C4?

C4 is a hierarchical way to describe software architecture at four levels of detail (hence "C4"). This plugin implements the first three levels, which are enough to describe any real system:

| Level | Name | Question it answers |
|---|---|---|
| 1 | **Landscape** | What domains exist and how do they relate? |
| 2 | **Context** | What systems are inside a domain and what do they connect to? |
| 3 | **Container** | What services/components are inside a system and how do they connect? |

> The 4th level (Component) is not implemented — it adds complexity without practical benefit for most teams.

---

## The Hierarchy

The C4 model is a **tree** (or DAG). Each node has a position in the tree, and that position *is* its type:

```
Domain          ← depth 0  (no parent)
  └── System    ← depth 1  (parent is a Domain)
        └── Container  ← depth 2  (parent is a System)
```

There is no explicit `type` field. The `depth` field is stored as a denormalized integer for fast DB queries, but it's always derivable from the parentId chain.

**Why depth instead of a type enum?**
Enums drift. If you add a type field, it gets out of sync with the tree structure. Depth is computed once on write and is always structurally correct. It's also O(1) to read from the DB — no tree traversal needed.

---

## Catalog Entity → C4 Concept Mapping

| Backstage Kind | C4 Concept | Depth |
|---|---|---|
| `Domain` | Domain node | 0 |
| `System` | System node | 1 |
| `Component` | Container node | 2 |
| `Resource` | Container node | 2 |
| `User` / `Group` | Actor | — |
| `API` | Used to derive relationships | — |

> **Actors** (`C4Actor`) are people or groups outside the system hierarchy. They don't have depth — they're not nodes in the tree.

---

## Core Types

### `C4Node`

A node in the C4 tree. Its depth determines its role.

```typescript
interface C4Node {
  id: string;
  parentId?: string;   // undefined = root (depth 0)
  depth: number;       // 0 = domain, 1 = system, 2 = container
  name: string;
  description: string;
  technology?: string; // meaningful at depth 2 (e.g. "Node.js", "PostgreSQL")
  subType?: 'service' | 'database' | 'queue' | 'resource';  // depth-2 shape hint
  tags: string[];
  catalogEntityRef?: string;  // the Backstage entity this came from
}
```

### `C4Actor`

A human (or group) that interacts with the system. Not part of the tree.

```typescript
interface C4Actor {
  id: string;
  name: string;
  description: string;
  tags: string[];
  catalogEntityRef?: string;
}
```

### `C4Relationship`

A directed edge between any two `C4Node`s or `C4Actor`s.

```typescript
interface C4Relationship {
  id: string;
  sourceId: string;   // C4Node.id or C4Actor.id
  targetId: string;   // C4Node.id or C4Actor.id
  description: string;
  technology?: string;
  tags: string[];
}
```

> **Relationships at multiple depths:** The catalog processor automatically rolls up container-level (`dependsOn`) edges to system-level and domain-level. This way, every diagram level has ready-to-use relationships without requiring a tree traversal at render time.

### `C4Model`

The raw data stored by a sync provider. No views — views are projections.

```typescript
interface C4Model {
  nodes: C4Node[];
  actors: C4Actor[];
  relationships: C4Relationship[];
}
```

### `C4ViewDescriptor`

A thin record that says *"there is a diagram centred on this node"*. Stored in DB. No element lists, no relationship IDs — those are computed on demand.

```typescript
interface C4ViewDescriptor {
  id: string;
  title: string;
  subjectId: string;   // the C4Node at the centre of this diagram
  entityRef?: string;  // the Backstage entity that owns this view
  source: string;      // 'catalog', 'dsl', or any registered provider id
}
```

### `C4Diagram`

A computed diagram — fully resolved, ready to render. Never stored; always derived from the tree.

```typescript
interface C4Diagram {
  descriptor: C4ViewDescriptor;
  nodes: C4Node[];          // subject + internal nodes + external neighbors
  actors: C4Actor[];        // external actors connected to internal nodes
  relationships: C4Relationship[];  // only edges where both sides are visible
}
```

---

## How Diagrams Are Computed

When you request `GET /views/:id`, the backend computes the diagram on demand:

1. Load the `C4ViewDescriptor` for the given ID
2. Load the subject `C4Node` → its `depth` determines the diagram level
3. Determine **internal nodes**:
   - depth 0 subject → children at depth 1 (systems inside the domain)
   - depth 1 subject → children at depth 2 (containers inside the system)
   - depth 2 subject → the subject itself (a container is its own internal)
4. Find all **relationships** touching the internal nodes
5. Resolve the far side of each relationship:
   - If it's another node → external node
   - If it's an actor → external actor
6. Filter relationships: keep only edges where **both sides** are visible
7. Return `{ descriptor, nodes: [subject, ...internal, ...external], actors, relationships }`

Results are cached in-memory per `viewId`. The cache is cleared on every sync.

---

## Diagram Levels Explained

### Landscape (depth 0 subject)

Shows **systems** inside the domain boundary, and any external systems they connect to.

```
┌─────────────────────────────────────┐
│  My Domain                          │
│  ┌──────────┐   ┌──────────┐        │
│  │ System A │──▶│ System B │        │
│  └──────────┘   └──────────┘        │
└─────────────────────────────────────┘
                        │
                  ┌─────┴──────┐
                  │ External   │
                  │ System C   │
                  └────────────┘
```

### Context (depth 1 subject)

Shows **containers** inside the system boundary, and external systems/actors they connect to.

```
┌─────────────────────────────────────┐
│  Payment System                     │
│  ┌──────────────┐  ┌─────────────┐  │
│  │  API Service │─▶│   Database  │  │
│  └──────────────┘  └─────────────┘  │
└─────────────────────────────────────┘
       │                    ▲
  [User Actor]       [External Queue]
```

### Container (depth 2 subject)

Shows the **container itself** and everything it directly connects to.

```
 ┌──────────┐         ┌──────────────────────┐
 │  Browser │────────▶│  api-service (focus) │
 └──────────┘         └──────────────────────┘
                             │         │
                      [database]  [auth-service]
```

---

## Package Overview

| Package | Role |
|---|---|
| `@fulgas/plugin-c4-node` | Shared TypeScript types (`C4Node`, `C4Actor`, etc.) |
| `@fulgas/plugin-c4-backend` | Backend plugin: sync engine, DB store, REST API |
| `@fulgas/plugin-c4-backend-structurizr` | Optional provider: reads `.dsl` files via catalog annotations |
| `@fulgas/plugin-c4-frontend` | Modern Backstage frontend (extensions API) |
| `@fulgas/plugin-c4-frontend-legacy` | Legacy Backstage frontend (classic plugin API) |
| `@fulgas/plugin-c4-frontend-common` | Shared frontend: API client, hooks |
| `@fulgas/plugin-c4-renderer-react` | Diagram renderer (React Flow) |

---

## Sync Architecture

```
Catalog entities
      │
      ▼
CatalogProcessor.process()
      │  produces C4Model + C4ViewDescriptor[]
      ▼
ModelStore.saveModel(model, 'catalog')
ModelStore.saveViewDescriptors(descriptors, 'catalog')
      │
      ▼
  SQLite DB
  c4_nodes / c4_actors / c4_relationships / c4_view_descriptors
      │
      ▼  (on GET /views/:id)
ModelStore.computeDiagram(viewId)
      │  tree walk + cache
      ▼
  C4Diagram  →  JSON response
```

External providers (e.g. `c4-backend-structurizr`) register via the `c4ModelProviderExtensionPoint` and produce the same `{ model, descriptors }` shape. They are synced alongside the catalog on every sync cycle.
