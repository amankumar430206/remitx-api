export const up = async (knex) => {
  await knex.schema.alterTable('scheduled_payments', (t) => {
    t.boolean('balance_insufficient').notNullable().defaultTo(false);
    // Which countdown day was last notified (5,4,3,2,1) — prevents duplicate alerts per day
    t.smallint('balance_alert_last_day').nullable();
  });
};

export const down = async (knex) => {
  await knex.schema.alterTable('scheduled_payments', (t) => {
    t.dropColumn('balance_insufficient');
    t.dropColumn('balance_alert_last_day');
  });
};
