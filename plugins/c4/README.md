# @fulgas/plugin-c4

Frontend plugin for C4 architecture diagrams.

## Installation

```bash
yarn workspace app add @fulgas/plugin-c4
```

## Setup

### Add Route

```typescript
// packages/app/src/App.tsx
import { C4Page } from '@fulgas/plugin-c4';

const routes = (
  <FlatRoutes>
    {/* ... other routes */}
    <Route path="/c4" element={<C4Page />} />
  </FlatRoutes>
);
```

### Add Navigation (Optional)

```typescript
// packages/app/src/components/Root/Root.tsx
import ExtensionIcon from '@material-ui/icons/Extension';

<SidebarItem icon={ExtensionIcon} to="c4" text="C4 Diagrams" />;
```

## Usage

Navigate to `/c4` to view C4 diagrams.
