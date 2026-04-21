import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('c4_node_positions', table => {
    table.text('view_id').notNullable();
    table.text('node_id').notNullable();
    table.float('x').notNullable();
    table.float('y').notNullable();
    table.primary(['view_id', 'node_id']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('c4_node_positions');
}
