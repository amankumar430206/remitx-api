export const up = async (knex) => {
  await knex.schema.createTable('tenant_provider_credentials', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    t.string('provider_name', 64).notNullable().defaultTo('manual');
    t.boolean('is_active').notNullable().defaultTo(true);
    // Stores all provider-specific credentials as JSONB.
    // For zoqq: { api_key, product_id, client_key, client_secret, user_id, auth_email }
    t.jsonb('config').notNullable().defaultTo('{}');
    t.timestamps(true, true);

    t.unique(['tenant_id']); // one active credential set per tenant
    t.index(['tenant_id', 'provider_name']);
  });
};

export const down = async (knex) => {
  await knex.schema.dropTableIfExists('tenant_provider_credentials');
};
