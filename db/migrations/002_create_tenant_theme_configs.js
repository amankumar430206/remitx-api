export const up = async (knex) => {
  await knex.schema.createTable('tenant_theme_configs', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('tenant_id').notNullable().unique().references('id').inTable('tenants').onDelete('CASCADE');
    t.string('primary_color', 7);
    t.string('secondary_color', 7);
    t.text('logo_url');
    t.text('favicon_url');
    t.string('company_name', 256);
    t.string('custom_domain', 256);
    t.string('font_family', 64);
    t.text('webhook_url');
    t.string('webhook_secret', 256);
    t.boolean('webhook_enabled').defaultTo(false);
    t.timestamps(true, true);
  });
};

export const down = async (knex) => {
  await knex.schema.dropTable('tenant_theme_configs');
};
