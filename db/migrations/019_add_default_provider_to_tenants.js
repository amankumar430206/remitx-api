export const up = async (knex) => {
  await knex.schema.alterTable('tenants', (t) => {
    t.string('default_provider_name', 64).nullable().defaultTo(null)
      .comment('Fallback provider for all corridors when no specific corridor config matches');
  });
};

export const down = async (knex) => {
  await knex.schema.alterTable('tenants', (t) => {
    t.dropColumn('default_provider_name');
  });
};
