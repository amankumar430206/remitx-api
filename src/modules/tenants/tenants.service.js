import { randomBytes } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';
import { AppError } from '../../shared/errors/AppError.js';
import redis from '../../config/redis.js';
import db from '../../config/database.js';
import { PERMISSION_CATALOG, findUnknownPermissions } from '../../shared/utils/permissionCatalog.js';
import { writeAudit } from '../../shared/utils/audit.js';
import * as repo from './tenants.repository.js';

const DEFAULT_THEME = {
  primary_color: '#1a56db',
  secondary_color: '#7e3af2',
  logo_url: null,
  favicon_url: null,
  company_name: 'RemitX',
  custom_domain: null,
  font_family: 'Inter',
  webhook_url: null,
  webhook_secret: null,
  webhook_enabled: false,
};

// ─── Default role hierarchy ─────────────────────────────────────────────────────
// A clean, simple tier every tenant gets out of the box:
//   super_admin  → platform/system owner (seeded once, not per tenant)
//   client_admin → administers the client/tenant workspace
//   user         → regular client user
// Everything else (maker, checker, sub-client roles) is an optional TEMPLATE that
// a super admin or client admin can instantiate on demand from the UI.
const NAV_ALL  = ['fx_rates:view', 'network:view', 'kyc:view', 'assistant:view'];
const NAV_USER = ['fx_rates:view', 'network:view', 'kyc:view', 'assistant:view'];

export const CORE_ROLES = {
  client_admin: {
    name: 'Client Admin',
    description: 'Administers the client workspace — manages users, roles, beneficiaries, and payments.',
    permissions: ['payments:*', 'beneficiaries:*', 'accounts:*', 'users:*', 'subclients:*', 'reports:*', 'admin:config', ...NAV_ALL],
  },
  user: {
    name: 'User',
    description: 'Regular client user — creates payments and manages beneficiaries.',
    permissions: ['payments:create', 'payments:view', 'beneficiaries:view', 'beneficiaries:create', 'accounts:view', 'reports:view', ...NAV_USER],
  },
};

// Pre-defined starting points an admin can load when creating a new role. These
// are NOT seeded for new tenants — they are offered in the UI as templates.
export const ROLE_TEMPLATES = {
  maker: {
    name: 'Maker',
    description: 'Creates and cancels payments; cannot approve.',
    permissions: ['payments:create', 'payments:cancel', 'beneficiaries:create', 'accounts:view', 'reports:view', ...NAV_USER],
  },
  checker: {
    name: 'Checker',
    description: 'Approves payments and views reports; cannot create payments.',
    permissions: ['payments:approve', 'payments:view_all', 'accounts:view', 'reports:view', 'reports:export', ...NAV_USER],
  },
  subclient_admin: {
    name: 'Sub-client Admin',
    description: 'Administers a sub-client and its users.',
    permissions: ['payments:create', 'payments:approve', 'beneficiaries:*', 'accounts:create', 'accounts:view', 'users:invite', 'reports:view', ...NAV_USER],
  },
  subclient_user: {
    name: 'Sub-client User',
    description: 'Day-to-day sub-client operations.',
    permissions: ['payments:create', 'beneficiaries:create', 'accounts:view', ...NAV_USER],
  },
};

// Display order for the role list — higher in the hierarchy first, custom roles last.
const ROLE_RANK = {
  super_admin: 0, client_admin: 1, user: 2,
  maker: 3, checker: 4, subclient_admin: 5, subclient_user: 6,
};
const rankOf = (key) => (key in ROLE_RANK ? ROLE_RANK[key] : 50);

// Seed the core role hierarchy (metadata + permissions) for a tenant. Idempotent:
// existing role metadata is left untouched so tenant edits survive re-runs.
export const seedRoleDefaults = async (tenantId, trx) => {
  for (const [key, def] of Object.entries(CORE_ROLES)) {
    await repo.seedSystemRole(tenantId, { key, name: def.name, description: def.description }, trx);
    await repo.setRolePermissions(tenantId, key, def.permissions, trx);
  }
};

// Templates offered in the UI when creating a role (name + suggested permissions).
export const getRoleTemplates = async () =>
  Object.entries(ROLE_TEMPLATES).map(([key, def]) => ({
    key,
    name: def.name,
    description: def.description,
    permissions: def.permissions,
  }));

export const getTenantConfig = async (tenantId) => {
  const tenant = await repo.findTenantById(tenantId);
  if (!tenant) return null;
  const { id, slug, name, status } = tenant;
  return { id, slug, name, status };
};

// Convert DB snake_case row → camelCase API response shape
const formatTheme = (row) => ({
  primaryColor:   row.primary_color   ?? DEFAULT_THEME.primary_color,
  secondaryColor: row.secondary_color ?? DEFAULT_THEME.secondary_color,
  logoUrl:        row.logo_url        ?? null,
  faviconUrl:     row.favicon_url     ?? null,
  tenantName:     row.company_name    ?? DEFAULT_THEME.company_name,
  fontFamily:     row.font_family     ?? DEFAULT_THEME.font_family,
});

// A tenant "has custom theme" when their row exists AND at least one visual
// field is non-null (i.e. not wiped by a reset).
const rowHasCustomTheme = (row) =>
  !!(row && (row.primary_color || row.secondary_color || row.logo_url ||
             row.company_name  || row.font_family));

export const getTenantTheme = async (tenantId) => {
  const config = await repo.findThemeConfig(tenantId);

  if (!rowHasCustomTheme(config)) {
    // No custom branding — inherit from the global (platform) theme config
    const globalConfig = await repo.findGlobalThemeConfig();
    if (globalConfig) {
      const { webhook_secret, ...safe } = globalConfig;
      return { ...formatTheme(safe), hasCustomTheme: false };
    }
    return { ...formatTheme(DEFAULT_THEME), hasCustomTheme: false };
  }

  const { webhook_secret, ...safeConfig } = config;
  return { ...formatTheme(safeConfig), hasCustomTheme: true };
};

// Returns the platform-wide default theme (the RemitX tenant's branding).
export const getGlobalTheme = async () => {
  const globalConfig = await repo.findGlobalThemeConfig();
  if (!globalConfig) return { ...formatTheme(DEFAULT_THEME), hasCustomTheme: false };
  const { webhook_secret, ...safe } = globalConfig;
  return { ...formatTheme(safe), hasCustomTheme: rowHasCustomTheme(globalConfig) };
};

// Reset a tenant's branding to global inheritance (nulls theme columns).
export const resetTenantTheme = async (tenantId) => {
  await repo.resetThemeFields(tenantId);
  // Return the theme they'll now see (the global fallback)
  return getTenantTheme(tenantId);
};

export const getWebhookConfig = async (tenantId) => {
  const config = await repo.findThemeConfig(tenantId);
  return {
    webhook_url: config?.webhook_url || null,
    webhook_enabled: config?.webhook_enabled || false,
    has_secret: !!(config?.webhook_secret),
  };
};

export const updateWebhookConfig = async (tenantId, { webhookUrl, webhookSecret, webhookEnabled }) => {
  if (webhookUrl !== undefined) {
    try { new URL(webhookUrl); } catch {
      throw new AppError('VALIDATION_ERROR', 'webhook_url must be a valid URL', 400);
    }
  }

  const data = {};
  if (webhookUrl !== undefined) data.webhook_url = webhookUrl;
  if (webhookEnabled !== undefined) data.webhook_enabled = webhookEnabled;
  if (webhookSecret !== undefined) {
    data.webhook_secret = webhookSecret || randomBytes(32).toString('hex');
  }

  const row = await repo.upsertWebhookConfig(tenantId, data);
  return {
    webhook_url: row.webhook_url,
    webhook_enabled: row.webhook_enabled,
    has_secret: !!(row.webhook_secret),
  };
};

// ─── Theme (client_admin update) ──────────────────────────────────────────────

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const ALLOWED_FONTS = ['Inter', 'DM Sans', 'Geist', 'System UI', 'Roboto', 'Lato', 'Open Sans', 'Poppins', 'Montserrat'];

// Validate and optionally validate logo URL (must be https or data: URI)
const isValidLogoUrl = (url) => {
  if (!url) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'data:';
  } catch {
    return false;
  }
};

export const updateTheme = async (tenantId, { primaryColor, secondaryColor, companyName, fontFamily, logoUrl }) => {
  if (primaryColor !== undefined && !HEX_COLOR.test(primaryColor)) {
    throw new AppError('VALIDATION_ERROR', 'primaryColor must be a valid hex color (e.g. #1a56db)', 400);
  }
  if (secondaryColor !== undefined && !HEX_COLOR.test(secondaryColor)) {
    throw new AppError('VALIDATION_ERROR', 'secondaryColor must be a valid hex color', 400);
  }
  if (fontFamily !== undefined && !ALLOWED_FONTS.includes(fontFamily)) {
    throw new AppError('VALIDATION_ERROR', `fontFamily must be one of: ${ALLOWED_FONTS.join(', ')}`, 400);
  }
  if (logoUrl !== undefined && logoUrl !== null && !isValidLogoUrl(logoUrl)) {
    throw new AppError('VALIDATION_ERROR', 'logoUrl must be a valid https URL', 400);
  }

  const data = {};
  if (primaryColor   !== undefined) data.primary_color   = primaryColor;
  if (secondaryColor !== undefined) data.secondary_color = secondaryColor;
  if (companyName    !== undefined) data.company_name    = companyName;
  if (fontFamily     !== undefined) data.font_family     = fontFamily;
  if (logoUrl        !== undefined) data.logo_url        = logoUrl;

  const row = await repo.upsertThemeConfig(tenantId, data);
  const { webhook_secret, ...safe } = row;
  return formatTheme(safe);
};

// ─── User management ──────────────────────────────────────────────────────────

// Validate that a role exists for this tenant (covers both seeded defaults and
// tenant-authored custom roles — the roles table is the single source of truth).
const assertRoleAssignable = async (tenantId, role) => {
  const found = await repo.findRoleByKey(tenantId, role);
  if (!found) {
    throw new AppError('VALIDATION_ERROR', `Unknown role: ${role}`, 400);
  }
};

export const inviteUser = async (tenantId, { email, role, firstName, lastName }) => {
  await assertRoleAssignable(tenantId, role);

  // Placeholder password — user sets real password via invite/accept
  const passwordHash = await bcrypt.hash(uuidv4(), 10);
  const user = await repo.createUser({
    tenant_id: tenantId,
    email,
    role,
    first_name: firstName || null,
    last_name: lastName || null,
    password_hash: passwordHash,
    status: 'invited',
    kyc_status: 'pending',
  });

  // Store invite token in Redis (TTL 72h)
  const token = randomBytes(32).toString('hex');
  await redis.setex(`invite:${token}`, 72 * 3600, user.id);

  const { password_hash, mfa_secret, ...safe } = user;
  return { user: safe, inviteToken: token };
};

export const listUsers = async (tenantId) => repo.listUsers(tenantId);

export const getUserById = async (id, tenantId) => {
  const user = await repo.findUserById(id, tenantId);
  if (!user) throw new AppError('NOT_FOUND', 'User not found', 404);
  return user;
};

export const updateUserStatus = async (id, tenantId, status) => {
  const VALID = ['active', 'inactive', 'suspended'];
  if (!VALID.includes(status)) {
    throw new AppError('VALIDATION_ERROR', `status must be one of: ${VALID.join(', ')}`, 400);
  }
  const user = await repo.updateUserStatus(id, tenantId, status);
  if (!user) throw new AppError('NOT_FOUND', 'User not found', 404);
  return user;
};

export const updateUserPermissions = async (tenantId, userId, { role }) => {
  await assertRoleAssignable(tenantId, role);
  const user = await repo.updateUserRole(userId, tenantId, role);
  if (!user) throw new AppError('NOT_FOUND', 'User not found', 404);

  // Invalidate permission cache so next login re-fetches
  await redis.del(`perms:${userId}`);
  return user;
};

// ─── Sub-clients ──────────────────────────────────────────────────────────────

export const createSubClient = async (tenantId, parentUserId, { email, role, firstName, lastName }) => {
  const SUB_ROLES = ['subclient_admin', 'subclient_user'];
  if (!SUB_ROLES.includes(role)) {
    throw new AppError('VALIDATION_ERROR', `role must be one of: ${SUB_ROLES.join(', ')}`, 400);
  }

  const passwordHash = await bcrypt.hash(uuidv4(), 10);
  const user = await repo.createUser({
    tenant_id: tenantId,
    parent_user_id: parentUserId,
    email,
    role,
    first_name: firstName || null,
    last_name: lastName || null,
    password_hash: passwordHash,
    status: 'invited',
    kyc_status: 'pending',
  });

  const token = randomBytes(32).toString('hex');
  await redis.setex(`invite:${token}`, 72 * 3600, user.id);

  const { password_hash, mfa_secret, ...safe } = user;
  return { user: safe, inviteToken: token };
};

export const listSubClients = async (tenantId, requestingUserId, role) => {
  // client_admin sees all sub-clients; others see only their own subtree
  const parentFilter = role === 'client_admin' ? null : requestingUserId;
  return repo.listSubClients(tenantId, parentFilter);
};

export const getSubClientById = async (id, tenantId) => {
  const user = await repo.findSubClientById(id, tenantId);
  if (!user) throw new AppError('NOT_FOUND', 'Sub-client not found', 404);
  return user;
};

// ─── Roles ────────────────────────────────────────────────────────────────────

const ROLE_KEY_PATTERN = /^[a-z][a-z0-9_]{1,63}$/;

// Derive a stable, URL-safe key from a human role name. e.g. "Treasury Ops" -> "treasury_ops"
const slugifyRoleKey = (name) =>
  String(name)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);

const assertPermissionsValid = (permissions) => {
  if (!Array.isArray(permissions)) {
    throw new AppError('VALIDATION_ERROR', 'permissions must be an array', 400);
  }
  const unknown = findUnknownPermissions(permissions);
  if (unknown.length > 0) {
    throw new AppError('VALIDATION_ERROR', `Unknown permission(s): ${unknown.join(', ')}`, 400);
  }
};

// Drop cached permissions for everyone holding this role so the next request re-derives them.
const invalidateRoleCache = async (tenantId, roleKey) => {
  const users = await repo.getUsersWithRole(tenantId, roleKey);
  await Promise.all(users.map((u) => redis.del(`perms:${u.id}`)));
};

export const getPermissionCatalog = async () => PERMISSION_CATALOG;

// Roles ordered by hierarchy (super_admin → client_admin → user → templates → custom).
// Includes a `userCount` field showing how many users currently hold each role.
export const listRoles = async (tenantId) => {
  const [roles, userCounts] = await Promise.all([
    repo.listRoles(tenantId),
    repo.countUsersPerRole(tenantId),
  ]);
  return roles
    .sort((a, b) => rankOf(a.key) - rankOf(b.key) || a.name.localeCompare(b.name))
    .map((r) => ({ ...r, userCount: userCounts[r.key] ?? 0 }));
};

export const createRole = async (tenantId, { name, key, description, permissions = [] }, actorId) => {
  if (!name || typeof name !== 'string' || !name.trim()) {
    throw new AppError('VALIDATION_ERROR', 'role name is required', 400);
  }
  const roleKey = key ? String(key).toLowerCase() : slugifyRoleKey(name);
  if (!ROLE_KEY_PATTERN.test(roleKey)) {
    throw new AppError('VALIDATION_ERROR', 'role key must start with a letter and contain only lowercase letters, numbers, and underscores', 400);
  }
  assertPermissionsValid(permissions);

  const existing = await repo.findRoleByKey(tenantId, roleKey);
  if (existing) {
    throw new AppError('CONFLICT', `A role with key "${roleKey}" already exists`, 409);
  }

  await db.transaction(async (trx) => {
    await repo.createRoleMeta(tenantId, { key: roleKey, name: name.trim(), description }, trx);
    await repo.setRolePermissions(tenantId, roleKey, permissions, trx);
  });

  await writeAudit({
    tenantId, actorId, action: 'role.created',
    resourceType: 'role', resourceId: roleKey,
    after: { key: roleKey, name: name.trim(), permissions },
  });

  return { role: roleKey, key: roleKey, name: name.trim(), description: description ?? null, isSystem: false, permissions, userCount: 0 };
};

export const updateRole = async (tenantId, key, { name, description, permissions }, actorId, actorPermissions = []) => {
  const role = await repo.findRoleByKey(tenantId, key);
  if (!role) throw new AppError('NOT_FOUND', 'Role not found', 404);

  const isSuperAdmin = actorPermissions.includes('*:*');
  if (role.is_system && !isSuperAdmin) {
    throw new AppError('FORBIDDEN', 'System roles cannot be modified. Create a custom role instead.', 403);
  }

  if (name !== undefined && (!name || !String(name).trim())) {
    throw new AppError('VALIDATION_ERROR', 'role name cannot be empty', 400);
  }
  if (permissions !== undefined) assertPermissionsValid(permissions);

  const before = { name: role.name, description: role.description };

  await db.transaction(async (trx) => {
    if (name !== undefined || description !== undefined) {
      await repo.updateRoleMeta(tenantId, key, {
        name: name !== undefined ? String(name).trim() : undefined,
        description,
      }, trx);
    }
    if (permissions !== undefined) {
      await repo.setRolePermissions(tenantId, key, permissions, trx);
    }
  });

  if (permissions !== undefined) await invalidateRoleCache(tenantId, key);

  const [updated] = (await repo.listRoles(tenantId)).filter((r) => r.key === key);

  await writeAudit({
    tenantId, actorId, action: 'role.updated',
    resourceType: 'role', resourceId: key,
    before,
    after: { name: updated?.name, permissions: updated?.permissions },
  });

  return updated;
};

export const deleteRole = async (tenantId, key, actorId) => {
  const role = await repo.findRoleByKey(tenantId, key);
  if (!role) throw new AppError('NOT_FOUND', 'Role not found', 404);

  if (role.is_system) {
    throw new AppError('FORBIDDEN', 'System roles cannot be deleted.', 403);
  }

  const userCount = await repo.countUsersWithRole(tenantId, key);
  if (userCount > 0) {
    throw new AppError('ROLE_IN_USE', `Cannot delete role "${key}" — ${userCount} user(s) still assigned. Reassign them first.`, 409);
  }

  await repo.deleteRole(tenantId, key);

  await writeAudit({
    tenantId, actorId, action: 'role.deleted',
    resourceType: 'role', resourceId: key,
    before: { key, name: role.name },
  });

  return { key, deleted: true };
};

// ─── Feature flags ────────────────────────────────────────────────────────────

export const getFeatureFlags = async (tenantId) => {
  const flags = await repo.getFeatureFlags(tenantId);
  return flags;
};

export const updateFeatureFlags = async (tenantId, flags) => {
  if (typeof flags !== 'object' || Array.isArray(flags)) {
    throw new AppError('VALIDATION_ERROR', 'flags must be a key-value object', 400);
  }
  const sanitized = Object.fromEntries(
    Object.entries(flags).map(([k, v]) => [String(k), Boolean(v)])
  );
  return repo.upsertFeatureFlags(tenantId, sanitized);
};
