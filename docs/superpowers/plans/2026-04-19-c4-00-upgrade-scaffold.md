# C4 — Plan 0: Backstage Upgrade + Scaffold New Packages

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade Backstage to latest version and scaffold 3 new plugin packages: `c4-common`, `c4-module`, `c4-renderer-mermaid`.

**Architecture:** Monorepo yarn workspaces. New packages follow existing pattern from `plugin-c4`. Backstage upgrade uses `backstage-cli versions:bump`.

**Tech Stack:** Backstage CLI, yarn workspaces.

**Prerequisite:** None — run this before all other plans.

---

### Task 1: Upgrade Backstage

**Files:**
- Modify: `backstage.json` (auto-updated by CLI)
- Modify: all `package.json` files (auto-updated by CLI)

- [ ] **Step 1: Run versions bump**

Run: `yarn backstage-cli versions:bump`

Expected: all `@backstage/*` packages updated to latest compatible versions, `backstage.json` version updated.

- [ ] **Step 2: Install updated deps**

Run: `yarn install`

Expected: no errors, lockfile updated.

- [ ] **Step 3: Verify TypeScript still compiles**

Run: `yarn tsc`

Expected: no errors (fix any breaking type changes before proceeding).

- [ ] **Step 4: Verify tests still pass**

Run: `yarn test --passWithNoTests`

Expected: existing tests pass.

---

### Task 2: Scaffold `@fulgas/plugin-c4-common`

**Files:**
- Create: `plugins/c4-common/package.json`
- Create: `plugins/c4-common/src/index.ts`
- Create: `plugins/c4-common/tsconfig.json`

- [ ] **Step 5: Create package.json**

```json
{
  "name": "@fulgas/plugin-c4-common",
  "version": "0.1.0",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "license": "Apache-2.0",
  "publishConfig": {
    "access": "public"
  },
  "backstage": {
    "role": "common-library"
  },
  "scripts": {
    "build": "backstage-cli package build",
    "lint": "backstage-cli package lint",
    "test": "backstage-cli package test",
    "clean": "backstage-cli package clean"
  },
  "dependencies": {
    "@backstage/core-components": "^0.14.0",
    "@backstage/core-plugin-api": "^1.9.0",
    "@backstage/plugin-catalog-react": "^1.10.0",
    "@backstage/theme": "^0.5.0",
    "@material-ui/core": "^4.12.4",
    "@material-ui/icons": "^4.11.3",
    "react": "^18.0.0",
    "swr": "^2.0.0"
  },
  "devDependencies": {
    "@backstage/cli": "*",
    "@backstage/test-utils": "^1.5.0",
    "@testing-library/react": "^14.0.0"
  },
  "peerDependencies": {
    "react": "^16.13.1 || ^17.0.0 || ^18.0.0"
  },
  "files": [
    "dist"
  ]
}
```

- [ ] **Step 6: Create placeholder index.ts**

```typescript
// plugins/c4-common/src/index.ts
export {};
```

- [ ] **Step 7: Create tsconfig.json**

```json
{
  "extends": "@backstage/cli/config/tsconfig.json",
  "include": ["src"],
  "exclude": ["node_modules"]
}
```

---

### Task 3: Scaffold `@fulgas/plugin-c4-module`

**Files:**
- Create: `plugins/c4-module/package.json`
- Create: `plugins/c4-module/src/index.ts`
- Create: `plugins/c4-module/tsconfig.json`

- [ ] **Step 8: Create package.json**

```json
{
  "name": "@fulgas/plugin-c4-module",
  "version": "0.1.0",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "license": "Apache-2.0",
  "publishConfig": {
    "access": "public"
  },
  "backstage": {
    "role": "frontend-plugin",
    "pluginId": "c4"
  },
  "scripts": {
    "build": "backstage-cli package build",
    "lint": "backstage-cli package lint",
    "test": "backstage-cli package test",
    "clean": "backstage-cli package clean"
  },
  "dependencies": {
    "@backstage/core-components": "^0.14.0",
    "@backstage/core-plugin-api": "^1.9.0",
    "@backstage/frontend-plugin-api": "*",
    "@backstage/plugin-catalog-react": "^1.10.0",
    "@fulgas/plugin-c4-common": "^0.1.0",
    "@material-ui/core": "^4.12.4",
    "react": "^18.0.0"
  },
  "devDependencies": {
    "@backstage/cli": "*",
    "@backstage/test-utils": "^1.5.0",
    "@testing-library/react": "^14.0.0"
  },
  "peerDependencies": {
    "react": "^16.13.1 || ^17.0.0 || ^18.0.0"
  },
  "files": [
    "dist"
  ]
}
```

- [ ] **Step 9: Create placeholder index.ts**

```typescript
// plugins/c4-module/src/index.ts
export {};
```

- [ ] **Step 10: Create tsconfig.json**

```json
{
  "extends": "@backstage/cli/config/tsconfig.json",
  "include": ["src"],
  "exclude": ["node_modules"]
}
```

---

### Task 4: Scaffold `@fulgas/plugin-c4-renderer-mermaid`

**Files:**
- Create: `plugins/c4-renderer-mermaid/package.json`
- Create: `plugins/c4-renderer-mermaid/src/index.ts`
- Create: `plugins/c4-renderer-mermaid/tsconfig.json`

- [ ] **Step 11: Create package.json**

```json
{
  "name": "@fulgas/plugin-c4-renderer-mermaid",
  "version": "0.1.0",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "license": "Apache-2.0",
  "publishConfig": {
    "access": "public"
  },
  "backstage": {
    "role": "common-library"
  },
  "scripts": {
    "build": "backstage-cli package build",
    "lint": "backstage-cli package lint",
    "test": "backstage-cli package test",
    "clean": "backstage-cli package clean"
  },
  "dependencies": {
    "@fulgas/plugin-c4-common": "^0.1.0",
    "mermaid": "^10.0.0",
    "react": "^18.0.0"
  },
  "devDependencies": {
    "@backstage/cli": "*",
    "@testing-library/react": "^14.0.0"
  },
  "peerDependencies": {
    "react": "^16.13.1 || ^17.0.0 || ^18.0.0"
  },
  "files": [
    "dist"
  ]
}
```

- [ ] **Step 12: Create placeholder index.ts**

```typescript
// plugins/c4-renderer-mermaid/src/index.ts
export {};
```

- [ ] **Step 13: Create tsconfig.json**

```json
{
  "extends": "@backstage/cli/config/tsconfig.json",
  "include": ["src"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 14: Install all new packages**

Run: `yarn install`

Expected: workspaces resolve, all 3 new packages appear in node_modules.

- [ ] **Step 15: Verify workspace packages are recognized**

Run: `yarn workspaces list`

Expected: output includes:
```
@fulgas/plugin-c4-common
@fulgas/plugin-c4-module
@fulgas/plugin-c4-renderer-mermaid
```
