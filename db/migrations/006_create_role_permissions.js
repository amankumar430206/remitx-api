export const up = async (knex) => {
  await knex.schema.createTable('role_permissions', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    t.string('role', 64).notNullable();
    t.string('permission', 128).notNullable();
    t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());

    t.unique(['tenant_id', 'role', 'permission']);
  });
};

export const down = async (knex) => {
  await knex.schema.dropTable('role_permissions');
};
