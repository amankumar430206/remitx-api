export const up = async (knex) => {
  await knex.schema.table('tenant_theme_configs', (t) => {
    t.jsonb('feature_flags').defaultTo('{}');
  });
};

export const down = async (knex) => {
  await knex.schema.table('tenant_theme_configs', (t) => {
    t.dropColumn('feature_flags');
  });
};
