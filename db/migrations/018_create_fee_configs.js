export const up = async (knex) => {
  await knex.schema.createTable('fee_configs', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    t.string('source_currency', 8).notNullable();
    t.string('dest_currency', 8).nullable();       // NULL = wildcard (any destination)
    t.enum('fee_type', ['flat', 'percent']).notNullable();
    t.decimal('fee_value', 18, 8).notNullable();   // flat: absolute amount; percent: rate (e.g. 0.5 = 0.5%)
    t.decimal('min_fee', 18, 8).nullable();         // percent only: floor
    t.decimal('max_fee', 18, 8).nullable();         // percent only: cap
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamps(true, true);

    t.unique(['tenant_id', 'source_currency', 'dest_currency']); // one rule per corridor
    t.index(['tenant_id', 'source_currency', 'is_active']);
  });
};

export const down = async (knex) => {
  await knex.schema.dropTableIfExists('fee_configs');
};
