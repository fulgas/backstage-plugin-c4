# C4 Backend — Plan 2: DB Migration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create Knex DB migration that defines all C4 tables.

**Architecture:** Single migration file run by ModelStore on startup. Uses Knex schema builder. Compatible with SQLite (dev) and PostgreSQL (prod) via Backstage DatabaseManager.

**Tech Stack:** TypeScript, Knex ^3.0.0.

**Prerequisite:** Plan 1 (types.ts) must be complete.

---

### Task 1: Add knex + uuid deps and create migration

**Files:**
- Modify: `plugins/c4-backend/package.json`
- Create: `plugins/c4-backend/src/store/migrations/001_initial.ts`

- [ ] **Step 1: Add dependencies to package.json**

In `plugins/c4-backend/package.json`, add to `dependencies`:
```json
"knex": "^3.0.0",
"uuid": "^9.0.0"
```

- [ ] **Step 2: Install**

Run: `yarn install`

Expected: no errors, knex and uuid added to node_modules.

- [ ] **Step 3: Create migration file**

```typescript
// plugins/c4-backend/src/store/migrations/001_initial.ts
import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('c4_elements', table => {
    table.text('id').primary();
    table.text('type').notNullable();
    table.text('name').notNullable();
    table.text('description').notNullable().defaultTo('');
    table.text('technology').nullable();
    table.text('tags').notNullable().defaultTo('[]'); // JSON array
    table.text('parent_id').nullable();
    table.text('catalog_entity_ref').nullable();
    table.text('source').notNullable();
  });

  await knex.schema.createTable('c4_relationships', table => {
    table.text('id').primary();
    table.text('source_id').notNullable();
    table.text('target_id').notNullable();
    table.text('description').notNullable().defaultTo('');
    table.text('technology').notNullable().defaultTo('');
    table.text('tags').notNullable().defaultTo('[]'); // JSON array
    table.text('source').notNullable();
  });

  await knex.schema.createTable('c4_views', table => {
    table.text('id').primary();
    table.text('type').notNullable();
    table.text('title').notNullable();
    table.text('entity_refs').notNullable().defaultTo('[]'); // JSON array
    table.text('relationship_ids').notNullable().defaultTo('[]'); // JSON array
    table.text('source').notNullable();
    table.text('entity_ref').nullable();
  });

  await knex.schema.createTable('c4_snapshots', table => {
    table.text('id').primary();
    table.text('view_id').notNullable();
    table.text('model_hash').notNullable();
    table.text('data').notNullable(); // JSON stringified C4Model
    table.text('created_at').notNullable();
  });

  await knex.schema.createTable('c4_sync_status', table => {
    table.integer('id').primary();
    table.text('last_catalog_sync').nullable();
    table.text('last_dsl_sync').nullable();
    table.text('catalog_status').notNullable().defaultTo('ok');
    table.text('dsl_status').notNullable().defaultTo('ok');
  });

  // Insert the single sync status row
  await knex('c4_sync_status').insert({
    id: 1,
    last_catalog_sync: null,
    last_dsl_sync: null,
    catalog_status: 'ok',
    dsl_status: 'ok',
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('c4_sync_status');
  await knex.schema.dropTableIfExists('c4_snapshots');
  await knex.schema.dropTableIfExists('c4_views');
  await knex.schema.dropTableIfExists('c4_relationships');
  await knex.schema.dropTableIfExists('c4_elements');
}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `yarn workspace @fulgas/plugin-c4-backend tsc --noEmit`

Expected: no errors.
