import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('c4_view_settings', table => {
    table.text('view_id').primary();
    table.text('settings').notNullable().defaultTo('{}');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('c4_view_settings');
}
