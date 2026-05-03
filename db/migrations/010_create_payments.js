export const up = async (knex) => {
  await knex.schema.createTable('payments', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('RESTRICT');
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('RESTRICT');
    t.uuid('checker_id').nullable().references('id').inTable('users').onDelete('RESTRICT');
    t.uuid('beneficiary_id').notNullable().references('id').inTable('beneficiaries').onDelete('RESTRICT');
    t.uuid('account_id').notNullable().references('id').inTable('accounts').onDelete('RESTRICT');

    t.string('source_currency', 3).notNullable();
    t.decimal('source_amount', 24, 8).notNullable();
    t.string('dest_currency', 3).notNullable();
    t.decimal('dest_amount', 24, 8).notNullable();
    t.decimal('exchange_rate', 24, 8).notNullable();
    t.decimal('fee_amount', 24, 8).notNullable().defaultTo(0);

    t.string('purpose_code', 32).notNullable();
    t.string('reference', 64).notNullable();
    t.string('idempotency_key', 256).notNullable();
    t.uuid('quote_id').notNullable();

    t.string('provider_name', 64).nullable();
    t.string('provider_payment_id', 256).nullable();

    t.string('status', 32).notNullable().defaultTo('pending_approval');

    t.text('ops_notes').nullable();
    t.text('note').nullable();
    t.timestamp('completed_at').nullable();
    t.timestamps(true, true);

    t.unique(['tenant_id', 'idempotency_key']);
    t.index(['tenant_id', 'status']);
    t.index(['tenant_id', 'user_id']);
  });
};

export const down = async (knex) => {
  await knex.schema.dropTableIfExists('payments');
};
