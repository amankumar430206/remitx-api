export const up = async (knex) => {
  await knex.schema.createTable('users', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    t.uuid('parent_user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
    t.string('email', 256).notNullable();
    t.string('phone', 32);
    t.text('password_hash').notNullable();
    t.string('first_name', 128);
    t.string('last_name', 128);
    t.string('role', 64).notNullable();
    t.string('kyc_status', 32).defaultTo('pending');
    t.timestamp('kyc_expires_at', { useTz: true });
    t.boolean('mfa_enabled').defaultTo(false);
    t.text('mfa_secret');
    t.string('status', 32).defaultTo('invited');
    t.timestamp('last_login_at', { useTz: true });
    t.timestamps(true, true);

    t.unique(['tenant_id', 'email']);
    t.index('tenant_id');
    t.index('parent_user_id');
  });
};

export const down = async (knex) => {
  await knex.schema.dropTable('users');
};
