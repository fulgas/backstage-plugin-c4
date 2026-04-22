# backstage-plugin-c4

Backstage plugins for visualising C4 architecture diagrams sourced from the Backstage catalog.

## Packages

| Package                                                           | Description                                                                |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------- |
| [`@fulgas/plugin-c4-backend`](plugins/c4-backend)                 | Backend plugin — stores the C4 model, syncs from catalog, exposes REST API |
| [`@fulgas/plugin-c4-node`](plugins/c4-node)                       | Shared TypeScript types used by backend and frontend packages              |
| [`@fulgas/plugin-c4-frontend-common`](plugins/c4-frontend-common) | Shared API client, hooks, and UI components for frontend plugins           |
| [`@fulgas/plugin-c4-frontend`](plugins/c4-frontend)               | New Backstage frontend plugin (declarative extensions API)                 |
| [`@fulgas/plugin-c4-frontend-legacy`](plugins/c4-frontend-legacy) | Legacy Backstage frontend plugin (classic `createPlugin` API)              |
| [`@fulgas/plugin-c4-renderer-react`](plugins/c4-renderer-react)   | React Flow + ELK diagram renderer                                          |

## Quick start

```sh
yarn install
yarn start
```

Navigate to `/c4` to view C4 diagrams.

## Architecture

C4 data flows from Backstage catalog entities → backend plugin (stores in SQLite/PostgreSQL) → REST API → frontend plugins (render with React Flow + ELK layout).

See [`docs/c4-model.md`](docs/c4-model.md) for the C4 model concepts used.
