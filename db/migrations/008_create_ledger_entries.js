export const up = async (knex) => {
  await knex.schema.createTable('ledger_entries', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('RESTRICT');
    t.uuid('account_id').notNullable().references('id').inTable('accounts').onDelete('RESTRICT');
    t.uuid('payment_id').nullable(); // no FK yet — payments table added Phase 5
    t.string('entry_type', 10).notNullable(); // 'credit' | 'debit'
    t.specificType('amount', 'NUMERIC(24,8)').notNullable();
    t.string('currency', 3).notNullable();
    t.specificType('balance_after', 'NUMERIC(24,8)').notNullable();
    t.text('description');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    // No updated_at — append-only table

    t.index(['account_id', 'created_at']);
    t.index(['tenant_id', 'created_at']);
  });
};

export const down = async (knex) => {
  await knex.schema.dropTable('ledger_entries');
};
