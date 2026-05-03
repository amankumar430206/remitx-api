export const up = async (knex) => {
  await knex.schema.createTable('payment_status_history', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('tenant_id').notNullable();
    t.uuid('payment_id').notNullable().references('id').inTable('payments').onDelete('CASCADE');
    t.string('status', 32).notNullable();
    t.uuid('actor_id').nullable();
    t.string('actor_type', 16).notNullable().defaultTo('user');
    t.text('notes').nullable();
    // Append-only — no updated_at
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());

    t.index(['payment_id']);
    t.index(['tenant_id', 'payment_id']);
  });
};

export const down = async (knex) => {
  await knex.schema.dropTableIfExists('payment_status_history');
};
