import { randomBytes } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';
import { AppError } from '../../shared/errors/AppError.js';
import redis from '../../config/redis.js';
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

export const ROLE_DEFAULTS = {
  client_admin:    ['payments:*', 'beneficiaries:*', 'accounts:*', 'users:*', 'subclients:*', 'reports:*', 'admin:config'],
  maker:           ['payments:create', 'payments:cancel', 'beneficiaries:create', 'accounts:view', 'reports:view'],
  checker:         ['payments:approve', 'payments:view_all', 'accounts:view', 'reports:view', 'reports:export'],
  subclient_admin: ['payments:create', 'payments:approve', 'beneficiaries:*', 'accounts:create', 'accounts:view', 'users:invite', 'reports:view'],
  subclient_user:  ['payments:create', 'beneficiaries:create', 'accounts:view'],
};

// Seed default role permissions for a tenant (idempotent)
export const seedRoleDefaults = async (tenantId, trx) => {
  for (const [role, permissions] of Object.entries(ROLE_DEFAULTS)) {
    await repo.setRolePermissions(tenantId, role, permissions, trx);
  }
};

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

export const getTenantTheme = async (tenantId) => {
  const config = await repo.findThemeConfig(tenantId);
  if (!config) return formatTheme(DEFAULT_THEME);
  const { webhook_secret, ...safeConfig } = config;
  return formatTheme(safeConfig);
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

export const inviteUser = async (tenantId, { email, role, firstName, lastName }) => {
  const VALID_ROLES = Object.keys(ROLE_DEFAULTS);
  if (!VALID_ROLES.includes(role)) {
    throw new AppError('VALIDATION_ERROR', `role must be one of: ${VALID_ROLES.join(', ')}`, 400);
  }

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
  const VALID_ROLES = Object.keys(ROLE_DEFAULTS);
  if (!VALID_ROLES.includes(role)) {
    throw new AppError('VALIDATION_ERROR', `role must be one of: ${VALID_ROLES.join(', ')}`, 400);
  }
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

export const listRoles = async (tenantId) => repo.listRoles(tenantId);

export const upsertRole = async (tenantId, { role, permissions }) => {
  if (!role || typeof role !== 'string') {
    throw new AppError('VALIDATION_ERROR', 'role name is required', 400);
  }
  if (!Array.isArray(permissions)) {
    throw new AppError('VALIDATION_ERROR', 'permissions must be an array', 400);
  }
  await repo.setRolePermissions(tenantId, role, permissions);

  // Invalidate permission cache for all users with this role
  const users = await repo.getUsersWithRole(tenantId, role);
  await Promise.all(users.map((u) => redis.del(`perms:${u.id}`)));

  return { role, permissions };
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
