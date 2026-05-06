import db from '../../config/database.js';

export const findTenantById = async (id, trx = db) =>
  trx('tenants').where({ id }).first();

export const findTenantBySlug = async (slug, trx = db) =>
  trx('tenants').where({ slug }).first();

export const findThemeConfig = async (tenantId, trx = db) =>
  trx('tenant_theme_configs').where({ tenant_id: tenantId }).first();

export const getFeatureFlags = async (tenantId, trx = db) => {
  const row = await trx('tenant_theme_configs').where({ tenant_id: tenantId }).select('feature_flags').first();
  return row?.feature_flags ?? {};
};

export const upsertFeatureFlags = async (tenantId, flags, trx = db) => {
  const existing = await trx('tenant_theme_configs').where({ tenant_id: tenantId }).first();
  if (existing) {
    const [row] = await trx('tenant_theme_configs')
      .where({ tenant_id: tenantId })
      .update({ feature_flags: JSON.stringify(flags), updated_at: new Date() })
      .returning('feature_flags');
    return row.feature_flags;
  }
  const [row] = await trx('tenant_theme_configs')
    .insert({ tenant_id: tenantId, feature_flags: JSON.stringify(flags) })
    .returning('feature_flags');
  return row.feature_flags;
};

export const upsertWebhookConfig = async (tenantId, data, trx = db) => {
  const existing = await trx('tenant_theme_configs').where({ tenant_id: tenantId }).first();
  if (existing) {
    const [row] = await trx('tenant_theme_configs')
      .where({ tenant_id: tenantId })
      .update({ ...data, updated_at: new Date() })
      .returning('*');
    return row;
  }
  const [row] = await trx('tenant_theme_configs')
    .insert({ tenant_id: tenantId, ...data })
    .returning('*');
  return row;
};

// ─── Users ────────────────────────────────────────────────────────────────────

export const createUser = async (data, trx = db) => {
  const [row] = await trx('users').insert(data).returning('*');
  return row;
};

export const listUsers = async (tenantId, trx = db) =>
  trx('users')
    .where({ tenant_id: tenantId })
    .select('id', 'email', 'first_name', 'last_name', 'role', 'status', 'kyc_status', 'parent_user_id', 'created_at')
    .orderBy('created_at', 'desc');

export const findUserById = async (id, tenantId, trx = db) =>
  trx('users')
    .where({ id, tenant_id: tenantId })
    .select('id', 'email', 'first_name', 'last_name', 'role', 'status', 'kyc_status', 'parent_user_id', 'created_at')
    .first();

export const updateUserStatus = async (id, tenantId, status, trx = db) => {
  const [row] = await trx('users')
    .where({ id, tenant_id: tenantId })
    .update({ status, updated_at: new Date() })
    .returning(['id', 'email', 'role', 'status']);
  return row;
};

export const updateUserRole = async (id, tenantId, role, trx = db) => {
  const [row] = await trx('users')
    .where({ id, tenant_id: tenantId })
    .update({ role, updated_at: new Date() })
    .returning(['id', 'email', 'role', 'status']);
  return row;
};

// ─── Role permissions ─────────────────────────────────────────────────────────

export const listRoles = async (tenantId, trx = db) => {
  const rows = await trx('role_permissions')
    .where({ tenant_id: tenantId })
    .select('role', 'permission')
    .orderBy('role');
  const map = {};
  for (const r of rows) {
    if (!map[r.role]) map[r.role] = [];
    map[r.role].push(r.permission);
  }
  return Object.entries(map).map(([role, permissions]) => ({ role, permissions }));
};

export const getRolePermissions = async (tenantId, role, trx = db) =>
  trx('role_permissions').where({ tenant_id: tenantId, role }).select('permission');

export const setRolePermissions = async (tenantId, role, permissions, trx = db) => {
  await trx('role_permissions').where({ tenant_id: tenantId, role }).delete();
  if (permissions.length === 0) return;
  await trx('role_permissions').insert(
    permissions.map((permission) => ({ tenant_id: tenantId, role, permission })),
  );
};

export const getUsersWithRole = async (tenantId, role, trx = db) =>
  trx('users').where({ tenant_id: tenantId, role }).select('id');

// ─── Sub-clients ──────────────────────────────────────────────────────────────

export const listSubClients = async (tenantId, parentUserId, trx = db) => {
  const q = trx('users')
    .where({ tenant_id: tenantId })
    .whereNotNull('parent_user_id')
    .select('id', 'email', 'first_name', 'last_name', 'role', 'status', 'parent_user_id', 'created_at')
    .orderBy('created_at', 'desc');
  if (parentUserId) q.andWhere({ parent_user_id: parentUserId });
  return q;
};

export const findSubClientById = async (id, tenantId, trx = db) =>
  trx('users')
    .where({ id, tenant_id: tenantId })
    .whereNotNull('parent_user_id')
    .select('id', 'email', 'first_name', 'last_name', 'role', 'status', 'parent_user_id', 'created_at')
    .first();
