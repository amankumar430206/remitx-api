export const up = async (knex) => {
  await knex.schema.createTable('notifications', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.string('type', 64).notNullable();
    t.string('title', 256).notNullable();
    t.text('body').notNullable();
    t.jsonb('metadata').notNullable().defaultTo('{}');
    t.timestamp('read_at').nullable();
    t.integer('attempt_count').notNullable().defaultTo(0);
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    t.index(['tenant_id', 'user_id', 'read_at']);
    t.index(['tenant_id', 'user_id', 'created_at']);
  });
};

export const down = async (knex) => {
  await knex.schema.dropTableIfExists('notifications');
};
