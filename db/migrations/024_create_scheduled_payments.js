export const up = async (knex) => {
  await knex.schema.createTable('scheduled_payments', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.uuid('beneficiary_id').notNullable().references('id').inTable('beneficiaries').onDelete('CASCADE');
    t.uuid('account_id').notNullable().references('id').inTable('accounts').onDelete('CASCADE');

    t.string('source_currency', 3).notNullable();
    t.string('dest_currency', 3).notNullable();
    t.decimal('source_amount', 24, 8).notNullable();

    t.string('purpose_code', 32).notNullable();
    t.text('note').nullable();

    // once | weekly | monthly
    t.string('frequency', 16).notNullable().defaultTo('once');
    // next (or first) execution timestamp
    t.timestamp('scheduled_for', { useTz: true }).notNullable();
    // recurring only: stop creating new payments after this date
    t.timestamp('end_date', { useTz: true }).nullable();

    // active | cancelled | completed
    t.string('status', 16).notNullable().defaultTo('active');

    t.integer('execution_count').notNullable().defaultTo(0);
    t.timestamp('last_executed_at', { useTz: true }).nullable();
    // most recently created payment from this schedule
    t.uuid('last_payment_id').nullable().references('id').inTable('payments').onDelete('SET NULL');

    t.timestamps(true, true);

    t.index(['tenant_id', 'status']);
    t.index(['tenant_id', 'user_id']);
    // worker polls this index: active schedules due for execution
    t.index(['status', 'scheduled_for']);
  });
};

export const down = async (knex) => {
  await knex.schema.dropTableIfExists('scheduled_payments');
};
