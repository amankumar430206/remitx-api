export const up = async (knex) => {
  await knex.schema.createTable('approval_rules', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    t.string('name', 128).notNullable();
    t.decimal('min_amount', 24, 8).notNullable().defaultTo(0);
    t.decimal('max_amount', 24, 8).nullable();
    t.boolean('auto_approve').notNullable().defaultTo(false);
    t.integer('required_approvals').notNullable().defaultTo(1);
    t.integer('priority').notNullable().defaultTo(1);
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamps(true, true);

    t.index(['tenant_id', 'is_active', 'priority']);
  });
};

export const down = async (knex) => {
  await knex.schema.dropTableIfExists('approval_rules');
};
