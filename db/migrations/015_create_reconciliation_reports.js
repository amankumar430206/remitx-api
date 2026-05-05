export const up = async (knex) => {
  await knex.schema.createTable('reconciliation_reports', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    t.date('report_date').notNullable();
    t.integer('total_payments').notNullable().defaultTo(0);
    t.decimal('total_amount', 24, 8).notNullable().defaultTo(0);
    t.integer('matched_count').notNullable().defaultTo(0);
    t.integer('unmatched_count').notNullable().defaultTo(0);
    t.jsonb('exceptions').notNullable().defaultTo('[]');
    t.string('status', 32).notNullable().defaultTo('matched'); // matched | exceptions
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    t.unique(['tenant_id', 'report_date']);
    t.index(['tenant_id', 'report_date']);
  });
};

export const down = async (knex) => {
  await knex.schema.dropTableIfExists('reconciliation_reports');
};
