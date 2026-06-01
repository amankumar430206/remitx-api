export const up = async (knex) => {
  await knex.schema.createTable('global_fee_configs', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('source_currency', 8).notNullable();
    t.string('dest_currency', 8).nullable();       // NULL = wildcard (any destination)
    t.enum('fee_type', ['flat', 'percent']).notNullable();
    t.decimal('fee_value', 18, 8).notNullable();
    t.decimal('min_fee', 18, 8).nullable();
    t.decimal('max_fee', 18, 8).nullable();
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamps(true, true);

    t.unique(['source_currency', 'dest_currency']); // one rule per corridor globally
    t.index(['source_currency', 'is_active']);
  });

  // Add inherit_global flag; make fee_type/fee_value nullable so inherit rows don't need values.
  await knex.schema.alterTable('fee_configs', (t) => {
    t.boolean('inherit_global').notNullable().defaultTo(false);
  });

  await knex.raw(`
    ALTER TABLE fee_configs
      ALTER COLUMN fee_type DROP NOT NULL,
      ALTER COLUMN fee_value DROP NOT NULL
  `);
};

export const down = async (knex) => {
  await knex.raw(`
    ALTER TABLE fee_configs
      ALTER COLUMN fee_type SET NOT NULL,
      ALTER COLUMN fee_value SET NOT NULL
  `);
  await knex.schema.alterTable('fee_configs', (t) => {
    t.dropColumn('inherit_global');
  });
  await knex.schema.dropTableIfExists('global_fee_configs');
};
