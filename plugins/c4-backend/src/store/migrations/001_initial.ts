import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('c4_nodes', table => {
    table.text('id').primary();
    table.text('parent_id').nullable();
    table.integer('depth').notNullable();
    table.text('name').notNullable();
    table.text('description').notNullable().defaultTo('');
    table.text('technology').nullable();
    table.text('sub_type').nullable();
    table.boolean('navigable').notNullable().defaultTo(false);
    table.text('tags').notNullable().defaultTo('[]');
    table.text('catalog_entity_ref').nullable();
    table.text('source').notNullable();
  });

  await knex.schema.createTable('c4_actors', table => {
    table.text('id').primary();
    table.text('name').notNullable();
    table.text('description').notNullable().defaultTo('');
    table.text('tags').notNullable().defaultTo('[]');
    table.text('catalog_entity_ref').nullable();
    table.text('source').notNullable();
  });

  await knex.schema.createTable('c4_relationships', table => {
    table.text('id').primary();
    table.text('source_id').notNullable();
    table.text('target_id').notNullable();
    table.text('description').notNullable().defaultTo('');
    table.text('technology').nullable();
    table.text('tags').notNullable().defaultTo('[]');
    table.text('source').notNullable();
  });

  await knex.schema.createTable('c4_view_descriptors', table => {
    table.text('id').primary();
    table.text('title').notNullable();
    table.text('subject_id').notNullable();
    table.text('entity_ref').nullable();
    table.text('source').notNullable();
  });

  /** One row per sync source, upserted on every sync. */
  await knex.schema.createTable('c4_sync_status', table => {
    table.text('source').primary();
    table.text('last_sync').nullable();
    table.text('status').notNullable().defaultTo('ok');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('c4_sync_status');
  await knex.schema.dropTableIfExists('c4_view_descriptors');
  await knex.schema.dropTableIfExists('c4_relationships');
  await knex.schema.dropTableIfExists('c4_actors');
  await knex.schema.dropTableIfExists('c4_nodes');
}
