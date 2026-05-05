export const up = async (knex) => {
  await knex.schema.createTable('provider_corridor_configs', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    t.string('source_currency', 8).notNullable();
    t.string('dest_currency', 8).nullable(); // NULL = wildcard (any dest)
    t.string('provider_name', 64).notNullable().defaultTo('manual');
    t.integer('priority').notNullable().defaultTo(1);
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamps(true, true);

    t.unique(['tenant_id', 'source_currency', 'dest_currency']);
    t.index(['tenant_id', 'is_active', 'priority']);
  });
};

export const down = async (knex) => {
  await knex.schema.dropTableIfExists('provider_corridor_configs');
};
