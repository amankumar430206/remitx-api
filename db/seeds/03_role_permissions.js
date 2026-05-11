const ROLE_DEFAULTS = {
  client_admin:    ['payments:*', 'beneficiaries:*', 'accounts:*', 'users:*', 'subclients:*', 'reports:*', 'admin:config'],
  maker:           ['payments:create', 'payments:cancel', 'beneficiaries:create', 'accounts:view', 'reports:view'],
  checker:         ['payments:approve', 'payments:view_all', 'accounts:view', 'beneficiaries:view', 'reports:view', 'reports:export'],
  subclient_admin: ['payments:create', 'payments:approve', 'beneficiaries:*', 'accounts:create', 'accounts:view', 'users:invite', 'reports:view'],
  subclient_user:  ['payments:create', 'beneficiaries:create', 'accounts:view'],
  super_admin:     ['payments:*', 'beneficiaries:*', 'accounts:*', 'users:*', 'subclients:*', 'reports:*', 'admin:*', 'tenants:*', 'compliance:*'],
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

  for (const [role, permissions] of Object.entries(ROLE_DEFAULTS)) {
    const expanded = expandPermissions(permissions);
    for (const permission of expanded) {
      await knex('role_permissions')
        .insert({ tenant_id: tenant.id, role, permission })
        .onConflict(['tenant_id', 'role', 'permission'])
        .ignore();
    }
  }

  console.log('[seed] Role permissions seeded');
};
