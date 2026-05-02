export const up = async (knex) => {
  await knex.schema.createTable('refresh_tokens', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    t.text('token_hash').notNullable().unique();
    t.timestamp('expires_at', { useTz: true }).notNullable();
    t.timestamp('revoked_at', { useTz: true });
    t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());

    t.index('token_hash');
    t.index('user_id');
  });
};

export const down = async (knex) => {
  await knex.schema.dropTable('refresh_tokens');
};
