# @fulgas/plugin-c4-frontend-common

Shared API client, React hooks, and UI components used by both `@fulgas/plugin-c4-frontend` and `@fulgas/plugin-c4-frontend-legacy`.

Not intended for direct installation — install one of the frontend plugins instead.

## Exports

### API

```typescript
import { C4Api, c4ApiRef } from '@fulgas/plugin-c4-frontend-common';
```

`C4Api` interface and its Backstage API ref. Implemented by `C4ApiClient` (HTTP client against the backend plugin REST API).

### Hooks

```typescript
import { useC4View, useC4Views } from '@fulgas/plugin-c4-frontend-common';

const { descriptors, loading, building } = useC4Views();
const { diagram, loading, error } = useC4View(viewId);
```

### Components

```typescript
import {
  C4DiagramViewer,
  C4LevelFilter,
} from '@fulgas/plugin-c4-frontend-common';
```

- **`C4DiagramViewer`** — renders a diagram using a provided `C4Renderer` instance; handles loading/error states and exposes edit mode (save/reset node positions)
- **`C4LevelFilter`** — tab bar for filtering diagrams by C4 level (landscape / context / container)
