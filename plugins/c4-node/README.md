# @fulgas/plugin-c4-node

Shared TypeScript types for the C4 Backstage plugin ecosystem. Consumed by both backend and frontend packages.

## Types

```typescript
import type {
  C4Actor,
  C4Diagram,
  C4DiagramLevel,
  C4Model,
  C4Node,
  C4Relationship,
  C4Source,
  C4ViewDescriptor,
  C4ViewDisplaySettings,
} from '@fulgas/plugin-c4-node';
```

### Core model

- **`C4Node`** — a system, domain, or container node with `id`, `depth`, `parentId`, optional `subType` (`database` | `queue` | `resource`)
- **`C4Actor`** — an external person or system
- **`C4Relationship`** — a directed relationship between two nodes/actors with optional `description` and `technology`
- **`C4Model`** — the full set of nodes, actors, and relationships for a source

### View types

- **`C4ViewDescriptor`** — metadata for a diagram view: `id`, `title`, `subjectId`, `entityRef`, `source`, `level`, optional `displaySettings`
- **`C4ViewDisplaySettings`** — persisted display preferences: `direction` (`TB` | `LR` | `auto`), `nodeSep`, `rankSep`
- **`C4Diagram`** — a resolved diagram: descriptor + filtered nodes/actors/relationships + saved `nodePositions`
- **`C4DiagramLevel`** — `'landscape'` | `'context'` | `'container'`
- **`C4Source`** — `'catalog'` (extensible string union for future sync providers)
