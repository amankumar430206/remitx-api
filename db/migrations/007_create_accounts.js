export const up = async (knex) => {
  await knex.schema.createTable('accounts', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('RESTRICT');
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('RESTRICT');
    t.string('currency', 3).notNullable();
    t.string('account_number', 64).notNullable().unique();
    t.string('provider_name', 64).notNullable().defaultTo('manual');
    t.string('provider_account_id', 256).nullable();
    t.string('status', 32).notNullable().defaultTo('active');
    t.timestamps(true, true);

    t.index(['tenant_id', 'user_id']);
    t.index('tenant_id');
  });
};

export const down = async (knex) => {
  await knex.schema.dropTable('accounts');
};
