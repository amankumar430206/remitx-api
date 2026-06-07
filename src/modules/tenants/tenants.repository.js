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

// Generic upsert for the tenant_theme_configs row (used by both theme and webhook updates)
export const upsertThemeConfig = async (tenantId, data, trx = db) => {
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

// Alias kept for backwards-compatibility (webhook update path uses this)
export const upsertWebhookConfig = upsertThemeConfig;

// Global (platform) theme config — the RemitX tenant's theme row.
// Used as the fallback when a client tenant has no custom branding.
export const findGlobalThemeConfig = async (trx = db) => {
  const platform = await trx('tenants').where({ slug: 'remitx' }).first();
  if (!platform) return null;
  return trx('tenant_theme_configs').where({ tenant_id: platform.id }).first();
};

// NULL out all theme columns for a tenant (resets to global inheritance).
// Preserves the row so webhook / feature-flag data is not lost.
export const resetThemeFields = async (tenantId, trx = db) => {
  const existing = await trx('tenant_theme_configs').where({ tenant_id: tenantId }).first();
  if (existing) {
    await trx('tenant_theme_configs')
      .where({ tenant_id: tenantId })
      .update({
        primary_color:   null,
        secondary_color: null,
        logo_url:        null,
        company_name:    null,
        font_family:     null,
        updated_at:      new Date(),
      });
  }
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

// ─── Roles & permissions ──────────────────────────────────────────────────────

// Returns every role (from the `roles` metadata table) with its permission list
// joined in. A role with metadata but no permission rows yet returns [].
export const listRoles = async (tenantId, trx = db) => {
  const roles = await trx('roles')
    .where({ tenant_id: tenantId })
    .select('key', 'name', 'description', 'is_system')
    .orderBy('name');
  const perms = await trx('role_permissions')
    .where({ tenant_id: tenantId })
    .select('role', 'permission');

  const byRole = {};
  for (const p of perms) {
    if (!byRole[p.role]) byRole[p.role] = [];
    byRole[p.role].push(p.permission);
  }
  return roles.map((r) => ({
    role: r.key, // kept as `role` for backward compat with existing callers
    key: r.key,
    name: r.name,
    description: r.description,
    isSystem: r.is_system,
    permissions: byRole[r.key] ?? [],
  }));
};

export const findRoleByKey = async (tenantId, key, trx = db) =>
  trx('roles').where({ tenant_id: tenantId, key }).first();

// Insert a seeded system role; leaves existing rows untouched (idempotent seed).
export const seedSystemRole = async (tenantId, { key, name, description }, trx = db) =>
  trx('roles')
    .insert({ tenant_id: tenantId, key, name, description: description ?? null, is_system: true })
    .onConflict(['tenant_id', 'key'])
    .ignore();

export const createRoleMeta = async (tenantId, { key, name, description }, trx = db) => {
  const [row] = await trx('roles')
    .insert({ tenant_id: tenantId, key, name, description: description ?? null, is_system: false })
    .returning('*');
  return row;
};

export const updateRoleMeta = async (tenantId, key, { name, description }, trx = db) => {
  const patch = { updated_at: new Date() };
  if (name !== undefined) patch.name = name;
  if (description !== undefined) patch.description = description;
  const [row] = await trx('roles')
    .where({ tenant_id: tenantId, key })
    .update(patch)
    .returning('*');
  return row;
};

export const deleteRole = async (tenantId, key, trx = db) => {
  await trx('role_permissions').where({ tenant_id: tenantId, role: key }).delete();
  return trx('roles').where({ tenant_id: tenantId, key }).delete();
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

export const countUsersWithRole = async (tenantId, role, trx = db) => {
  const [{ count }] = await trx('users')
    .where({ tenant_id: tenantId, role })
    .count({ count: '*' });
  return Number(count);
};

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
