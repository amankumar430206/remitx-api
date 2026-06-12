export const up = async (knex) => {
  await knex.schema.table('payments', (t) => {
    t.uuid('scheduled_payment_id').nullable().references('id').inTable('scheduled_payments').onDelete('SET NULL');
    t.index('scheduled_payment_id', 'payments_scheduled_payment_id_idx');
  });
};

export const down = async (knex) => {
  await knex.schema.table('payments', (t) => {
    t.dropIndex('scheduled_payment_id', 'payments_scheduled_payment_id_idx');
    t.dropColumn('scheduled_payment_id');
  });
};
