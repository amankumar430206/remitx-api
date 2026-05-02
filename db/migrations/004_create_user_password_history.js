export const up = async (knex) => {
  await knex.schema.createTable('user_password_history', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.text('password_hash').notNullable();
    t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());

    t.index('user_id');
  });
};

export const down = async (knex) => {
  await knex.schema.dropTable('user_password_history');
};
