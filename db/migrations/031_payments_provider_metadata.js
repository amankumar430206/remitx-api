export const up = async (knex) => {
  await knex.schema.table('payments', (t) => {
    t.jsonb('provider_metadata').nullable().defaultTo(null);
  });
};

export const down = async (knex) => {
  await knex.schema.table('payments', (t) => {
    t.dropColumn('provider_metadata');
  });
};
