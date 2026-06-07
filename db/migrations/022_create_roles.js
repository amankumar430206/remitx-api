// Roles metadata table. Until now "roles" existed only implicitly as distinct
// `role` strings in `role_permissions`. This table gives each role a stable
// identity (display name, description) and distinguishes seeded system roles
// from tenant-authored custom roles, enabling full role lifecycle management.
//
// NOTE: `role_permissions` and `users.role` remain keyed by the role `key`
// string — this table is additive metadata, so the hot auth path is untouched.

const SYSTEM_ROLE_KEYS = [
  'client_admin',
  'maker',
  'checker',
  'subclient_admin',
  'subclient_user',
  'super_admin',
];

export const up = async (knex) => {
  await knex.schema.createTable('roles', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
    t.string('key', 64).notNullable();
    t.string('name', 128).notNullable();
    t.text('description');
    t.boolean('is_system').notNullable().defaultTo(false);
    t.timestamps(true, true);

    t.unique(['tenant_id', 'key']);
    t.index('tenant_id');
  });

  // Backfill: create a metadata row for every role that already has permissions.
  const existing = await knex('role_permissions')
    .distinct('tenant_id', 'role')
    .select('tenant_id', 'role');

  if (existing.length > 0) {
    const titleCase = (key) =>
      key.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

    await knex('roles')
      .insert(
        existing.map(({ tenant_id, role }) => ({
          tenant_id,
          key: role,
          name: titleCase(role),
          description: null,
          is_system: SYSTEM_ROLE_KEYS.includes(role),
        })),
      )
      .onConflict(['tenant_id', 'key'])
      .ignore();
  }
};

export const down = async (knex) => {
  await knex.schema.dropTable('roles');
};
