export const up = async (knex) => {
  await knex.schema.createTable('audit_logs', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    t.uuid('actor_id').nullable();
    t.string('actor_type', 32);
    t.string('action', 128).notNullable();
    t.string('resource_type', 64);
    t.uuid('resource_id');
    t.string('ip_address', 64);
    t.text('user_agent');
    t.jsonb('before');
    t.jsonb('after');
    t.jsonb('metadata');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.index(['tenant_id', 'created_at']);
    t.index(['resource_type', 'resource_id']);
  });
  // NOTE: REVOKE UPDATE, DELETE on this table in production
};

export const down = async (knex) => {
  await knex.schema.dropTable('audit_logs');
};
