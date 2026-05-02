import db from '../../config/database.js';

export const findUserByEmail = async (email, tenantId, trx = db) =>
  trx('users').where({ email, tenant_id: tenantId }).first();

export const findUserById = async (id, tenantId, trx = db) =>
  trx('users').where({ id, tenant_id: tenantId }).first();

export const updateUserLastLogin = async (id, tenantId, trx = db) =>
  trx('users').where({ id, tenant_id: tenantId }).update({ last_login_at: new Date(), updated_at: new Date() });

export const updateUser = async (id, tenantId, data, trx = db) =>
  trx('users').where({ id, tenant_id: tenantId }).update({ ...data, updated_at: new Date() });

export const storeRefreshToken = async ({ userId, tenantId, tokenHash, expiresAt }, trx = db) =>
  trx('refresh_tokens').insert({
    user_id: userId,
    tenant_id: tenantId,
    token_hash: tokenHash,
    expires_at: expiresAt,
    created_at: new Date(),
  });

export const findRefreshToken = async (tokenHash, trx = db) =>
  trx('refresh_tokens')
    .where({ token_hash: tokenHash })
    .whereNull('revoked_at')
    .where('expires_at', '>', new Date())
    .first();

export const deleteRefreshToken = async (tokenHash, trx = db) =>
  trx('refresh_tokens').where({ token_hash: tokenHash }).delete();

export const deleteUserRefreshTokens = async (userId, trx = db) =>
  trx('refresh_tokens').where({ user_id: userId }).delete();

export const getRolePermissions = async (tenantId, role, trx = db) =>
  trx('role_permissions').where({ tenant_id: tenantId, role }).select('permission');

export const getPasswordHistory = async (userId, limit = 5, trx = db) =>
  trx('user_password_history')
    .where({ user_id: userId })
    .orderBy('created_at', 'desc')
    .limit(limit)
    .select('password_hash');

export const addPasswordHistory = async (userId, passwordHash, trx = db) =>
  trx('user_password_history').insert({
    user_id: userId,
    password_hash: passwordHash,
    created_at: new Date(),
  });
