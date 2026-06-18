export const up = async (knex) => {
  await knex.schema.alterTable('provider_corridor_configs', (t) => {
    t.string('source_currency', 8).nullable().alter();
  });

  // Replace the existing unique constraint with a COALESCE-based index so
  // (tenant_id, NULL, NULL) is treated as one unique any-to-any row.
  await knex.raw(`
    ALTER TABLE provider_corridor_configs
    DROP CONSTRAINT IF EXISTS provider_corridor_configs_tenant_id_source_currency_dest_currency_unique;
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS provider_corridor_configs_unique_idx
    ON provider_corridor_configs (tenant_id, COALESCE(source_currency, ''), COALESCE(dest_currency, ''));
  `);
};

export const down = async (knex) => {
  await knex.raw(`DROP INDEX IF EXISTS provider_corridor_configs_unique_idx;`);
  await knex.schema.alterTable('provider_corridor_configs', (t) => {
    t.string('source_currency', 8).notNullable().alter();
  });
  await knex.schema.alterTable('provider_corridor_configs', (t) => {
    t.unique(['tenant_id', 'source_currency', 'dest_currency']);
  });
};
