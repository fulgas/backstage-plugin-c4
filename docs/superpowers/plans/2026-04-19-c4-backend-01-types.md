# C4 Backend — Plan 1: Shared Types

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Define all shared TypeScript types used across the backend plugin.

**Architecture:** Pure type definitions — no logic. All other backend tasks import from this file.

**Tech Stack:** TypeScript.

---

### Task 1: Create types.ts

**Files:**
- Create: `plugins/c4-backend/src/types.ts`

- [ ] **Step 1: Write types.ts**

```typescript
// plugins/c4-backend/src/types.ts
export type C4ElementType = 'person' | 'system' | 'container' | 'component';
export type C4ViewType = 'landscape' | 'context' | 'container' | 'component';
export type C4Source = 'catalog' | 'dsl';

export interface C4Person {
  id: string;
  name: string;
  description: string;
  tags: string[];
}

export interface C4System {
  id: string;
  name: string;
  description: string;
  tags: string[];
  catalogEntityRef?: string;
}

export interface C4Container {
  id: string;
  systemId: string;
  name: string;
  description: string;
  technology: string;
  tags: string[];
  catalogEntityRef?: string;
}

export interface C4Component {
  id: string;
  containerId: string;
  name: string;
  description: string;
  technology: string;
  tags: string[];
  catalogEntityRef?: string;
}

export interface C4Relationship {
  id: string;
  sourceId: string;
  targetId: string;
  description: string;
  technology: string;
  tags: string[];
}

export interface C4View {
  id: string;
  type: C4ViewType;
  title: string;
  entityRefs: string[];
  relationshipIds: string[];
  source: C4Source;
  entityRef?: string;
}

export interface C4Snapshot {
  id: string;
  viewId: string;
  modelHash: string;
  data: string; // JSON-stringified C4Model
  createdAt: string; // ISO timestamp
}

export interface C4Model {
  persons: C4Person[];
  systems: C4System[];
  containers: C4Container[];
  components: C4Component[];
  relationships: C4Relationship[];
  views: C4View[];
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `yarn workspace @fulgas/plugin-c4-backend tsc --noEmit`

Expected: no errors.
