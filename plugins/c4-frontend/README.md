# @fulgas/plugin-c4-frontend

New Backstage frontend plugin for C4 architecture diagrams, using the declarative extensions API (`@backstage/frontend-plugin-api`).

> For classic Backstage setups, use [`@fulgas/plugin-c4`](../c4-frontend-legacy) instead.

## Installation

```bash
yarn workspace app add @fulgas/plugin-c4-frontend
```

## Setup

Add the plugin to your app's `features` list:

```typescript
// packages/app/src/App.tsx
import c4Plugin from '@fulgas/plugin-c4-frontend';

export default createApp({
  features: [
    // ... other plugins
    c4Plugin,
  ],
});
```

This registers two extensions:

- **`C4PageExtension`** — a `/c4` page listing all C4 diagrams with kind filtering and inline diagram view
- **`EntityC4TabExtension`** / **`EntityC4CardExtension`** — entity page tab and card showing diagrams for the current entity

## Extensions

### Page

Navigate to `/c4` to see all available C4 diagrams. Click a row to open the diagram inline.

### Entity tab / card

Add to your entity page in `packages/app/src/components/catalog/EntityPage.tsx`:

```typescript
import {
  EntityC4Tab,
  EntityC4Card,
  isC4Available,
} from '@fulgas/plugin-c4-frontend';

// Tab
<EntityLayout.Route path="/c4" title="C4" if={isC4Available}>
  <EntityC4Tab />
</EntityLayout.Route>

// Card
<EntitySwitch>
  <EntitySwitch.Case if={isC4Available}>
    <EntityC4Card />
  </EntitySwitch.Case>
</EntitySwitch>
```
