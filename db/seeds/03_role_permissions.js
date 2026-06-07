const ROLE_DEFAULTS = {
  client_admin:    { name: 'Admin',           permissions: ['payments:*', 'beneficiaries:*', 'accounts:*', 'users:*', 'subclients:*', 'reports:*', 'admin:config'] },
  maker:           { name: 'Maker',           permissions: ['payments:create', 'payments:cancel', 'beneficiaries:create', 'accounts:view', 'reports:view'] },
  checker:         { name: 'Checker',         permissions: ['payments:approve', 'payments:view_all', 'accounts:view', 'beneficiaries:view', 'reports:view', 'reports:export'] },
  subclient_admin: { name: 'Sub-client Admin', permissions: ['payments:create', 'payments:approve', 'beneficiaries:*', 'accounts:create', 'accounts:view', 'users:invite', 'reports:view'] },
  subclient_user:  { name: 'Sub-client User',  permissions: ['payments:create', 'beneficiaries:create', 'accounts:view'] },
  // super_admin = platform owner: full wildcard on every domain so it can reach
  // every feature/page AND manage roles/permissions for everyone. admin:* already
  // covers admin:features (platform feature-flag editing); listed for clarity.
  super_admin:     { name: 'Super Admin',      permissions: ['payments:*', 'beneficiaries:*', 'accounts:*', 'users:*', 'subclients:*', 'reports:*', 'admin:*', 'admin:features', 'tenants:*', 'compliance:*'] },
};

const expandPermissions = (permissions) => {
  const expanded = new Set();
  for (const perm of permissions) {
    if (perm.endsWith(':*')) {
      const domain = perm.slice(0, -2);
      const actions = ['create', 'view', 'view_all', 'update', 'delete', 'approve', 'cancel', 'export', 'config', 'invite'];
      for (const action of actions) {
        expanded.add(`${domain}:${action}`);
      }
      expanded.add(perm);
    } else {
      expanded.add(perm);
    }
  }
  return [...expanded];
};

export const seed = async (knex) => {
  const tenant = await knex('tenants').where({ slug: 'remitx' }).first();
  if (!tenant) throw new Error('Default tenant not found — run 01_default_tenant first');

  for (const [role, def] of Object.entries(ROLE_DEFAULTS)) {
    await knex('roles')
      .insert({ tenant_id: tenant.id, key: role, name: def.name, is_system: true })
      .onConflict(['tenant_id', 'key'])
      .ignore();

    const expanded = expandPermissions(def.permissions);
    for (const permission of expanded) {
      await knex('role_permissions')
        .insert({ tenant_id: tenant.id, role, permission })
        .onConflict(['tenant_id', 'role', 'permission'])
        .ignore();
    }
  }

  console.log('[seed] Role permissions seeded');
};
