export const up = async (knex) => {
  await knex.schema.createTable('beneficiaries', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('RESTRICT');
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('RESTRICT');

    // Identity
    t.string('name', 256).notNullable();
    t.string('country_code', 2).notNullable();
    t.string('currency', 3).notNullable();
    t.string('bank_name', 256);
    t.text('bank_address');

    // Corridor-specific banking fields
    t.string('account_number', 64);  // US, GB, IN, OTHER
    t.string('routing_number', 32);  // US
    t.string('sort_code', 32);       // GB
    t.string('ifsc_code', 16);       // IN
    t.string('iban', 64);            // EU, AE
    t.string('swift_bic', 16);       // EU, OTHER

    // Business
    t.string('purpose_code', 32);
    t.string('screening_status', 32).notNullable().defaultTo('pending');
    t.boolean('is_active').notNullable().defaultTo(true);

    t.timestamps(true, true);

    t.index(['tenant_id', 'user_id']);
    t.index(['tenant_id', 'is_active']);
    t.index('tenant_id');
  });
};

export const down = async (knex) => {
  await knex.schema.dropTable('beneficiaries');
};
