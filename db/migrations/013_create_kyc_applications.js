export const up = async (knex) => {
  await knex.schema.createTable('kyc_applications', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('RESTRICT');
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('RESTRICT');

    t.string('status', 32).notNullable().defaultTo('pending');
    t.jsonb('documents').notNullable().defaultTo('[]');

    t.uuid('reviewed_by').nullable().references('id').inTable('users').onDelete('SET NULL');
    t.timestamp('reviewed_at').nullable();
    t.text('rejection_reason').nullable();

    t.timestamps(true, true);

    t.unique(['tenant_id', 'user_id']);
    t.index(['tenant_id', 'status']);
  });
};

export const down = async (knex) => {
  await knex.schema.dropTableIfExists('kyc_applications');
};
