# @fulgas/plugin-c4-renderer-react

React Flow + ELK diagram renderer for C4 architecture diagrams.

Used internally by `@fulgas/plugin-c4-frontend-common`. Not intended for direct use.

## How it works

Layout runs as a pipeline of pure functions in `elkLayout.ts`:

1. **`classify`** — splits nodes into internal (inside boundary) / external (outside), detects subdomains for landscape views, deduplicates edges into `edgeMap`.
2. **`buildElkGraph`** — converts classified state into an ELK compound graph.
3. **`runElk`** — runs ELK (`layered` algorithm), resolves absolute positions, computes boundary rect.
4. **`placeExternals`** — places external nodes and actors around the boundary. Each external is assigned to the nearest boundary face of its connected internal's centroid, then spread with minimum spacing to prevent overlap.
5. **`buildFlowGraph`** — converts ELK output + external positions into React Flow nodes and edges. Edges use `HandleRouter` to select attachment points.

Adding a layout rule = adding a phase function and one call in `elkLayout.ts`.

## Edge routing

Each node has **12 handles**: 3 per face (¼, ½, ¾ along each face). The center handle (½) is preferred when a face has only one edge; near/far slots absorb additional edges on the same face.

`HandleRouter` selects handles using a scored rule set (`layout/routing/`):

| Rule               | Description                                                     |
| ------------------ | --------------------------------------------------------------- |
| `AvoidUsedRule`    | −1 000 000 penalty for handles already assigned to another edge |
| `PreferCenterRule` | +5 000 bonus for the center (½-face) handle when it is free     |
| `MinDistanceRule`  | −dist² so closer pairs score higher                             |

Rules are applied additively. Adding a rule = adding one object to the `HandleRouter.DEFAULT_RULES` array.

On node drag-stop, `recomputeEdgeSections` runs the router over all edges so handles snap to the new closest positions.

## Edit mode

When edit mode is active:

- All non-boundary nodes become draggable
- After each drag, edges automatically reconnect to the closest available handle
- On exit, `recomputeEdgeSections` re-anchors all edges to final positions
- Positions are persisted via the backend API

## Theming

All diagram colours are CSS custom properties. Override any variable in your app CSS to customise the look without touching plugin code.

See [`docs/theming.md`](../../docs/theming.md) for the full variable reference and examples.

## Key exports

```typescript
import { ReactC4Renderer } from '@fulgas/plugin-c4-renderer-react';

const renderer = new ReactC4Renderer();
```

`ReactC4Renderer` implements the `C4Renderer` interface from `@fulgas/plugin-c4-frontend-common`.
