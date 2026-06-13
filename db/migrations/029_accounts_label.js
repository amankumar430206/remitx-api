export const up = async (knex) => {
  await knex.schema.alterTable('accounts', (t) => {
    t.string('label', 128).nullable();
  });
};

export const down = async (knex) => {
  await knex.schema.alterTable('accounts', (t) => {
    t.dropColumn('label');
  });
};
