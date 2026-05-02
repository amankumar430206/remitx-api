export const up = async (knex) => {
  await knex.schema.createTable('tenants', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('slug', 64).notNullable().unique();
    t.string('name', 256).notNullable();
    t.string('status', 32).notNullable().defaultTo('active');
    t.timestamps(true, true);
  });
};

export const down = async (knex) => {
  await knex.schema.dropTable('tenants');
};
