import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import speakeasy from 'speakeasy';
import { v4 as uuidv4 } from 'uuid';
import db from '../../config/database.js';
import redis from '../../config/redis.js';
import { config } from '../../config/index.js';
import { AppError } from '../../shared/errors/AppError.js';
import { sha256, randomToken } from '../../shared/utils/crypto.js';
import { logger } from '../../shared/utils/logger.js';
import * as repo from './auth.repository.js';

const BCRYPT_ROUNDS = 12;
const REFRESH_TTL_DAYS = config.jwtRefreshTtlDays;

const expandPermissions = (rawPerms) => {
  const all = new Set();
  for (const { permission } of rawPerms) {
    all.add(permission);
  }
  return [...all];
};

const getUserPermissions = async (userId, tenantId, role) => {
  const cacheKey = `perms:${userId}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const rawPerms = await repo.getRolePermissions(tenantId, role);
  const permissions = expandPermissions(rawPerms);
  await redis.setex(cacheKey, 300, JSON.stringify(permissions));
  return permissions;
};

const issueAccessToken = (user, permissions) => {
  const jti = uuidv4();
  return jwt.sign(
    { sub: user.id, tenantId: user.tenant_id, role: user.role, permissions, jti },
    config.jwtPrivateKey,
    { algorithm: 'RS256', expiresIn: config.jwtAccessTtl },
  );
};

const issueRefreshToken = async (userId, tenantId) => {
  const raw = randomToken(32);
  const hash = sha256(raw);
  const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);
  await repo.storeRefreshToken({ userId, tenantId, tokenHash: hash, expiresAt });
  return raw;
};

export const login = async ({ email, password, mfaCode, tenantId }) => {
  const user = await repo.findUserByEmail(email, tenantId);
  if (!user) {
    throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
  }

  const passwordMatch = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatch) {
    throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
  }

  if (user.status !== 'active') {
    throw new AppError('UNAUTHORIZED', 'Account is not active', 401);
  }

  if (user.mfa_enabled) {
    if (!mfaCode) {
      const tempToken = jwt.sign(
        { sub: user.id, tenantId, purpose: 'mfa_challenge' },
        config.jwtPrivateKey,
        { algorithm: 'RS256', expiresIn: '5m' },
      );
      throw new AppError('MFA_REQUIRED', 'MFA code required', 200, [{ tempToken }]);
    }

    const valid = speakeasy.totp.verify({
      secret: user.mfa_secret,
      encoding: 'base32',
      token: mfaCode,
      window: 1,
    });
    if (!valid) {
      throw new AppError('MFA_INVALID', 'Invalid MFA code', 401);
    }
  }

  const permissions = await getUserPermissions(user.id, tenantId, user.role);
  const accessToken = issueAccessToken(user, permissions);
  const refreshToken = await issueRefreshToken(user.id, tenantId);
  await repo.updateUserLastLogin(user.id, tenantId);

  const { password_hash, mfa_secret, ...safeUser } = user;
  return { accessToken, refreshToken, user: safeUser };
};

export const refresh = async (rawToken) => {
  const hash = sha256(rawToken);
  const stored = await repo.findRefreshToken(hash);
  if (!stored) {
    throw new AppError('UNAUTHORIZED', 'Invalid or expired refresh token', 401);
  }

  const user = await repo.findUserById(stored.user_id, stored.tenant_id);
  if (!user) {
    throw new AppError('UNAUTHORIZED', 'User not found', 401);
  }

  await repo.deleteRefreshToken(hash);

  const permissions = await getUserPermissions(user.id, user.tenant_id, user.role);
  const accessToken = issueAccessToken(user, permissions);
  const refreshToken = await issueRefreshToken(user.id, user.tenant_id);

  return { accessToken, refreshToken };
};

export const logout = async ({ jti, exp, userId }) => {
  const remainingTtl = Math.max(0, exp - Math.floor(Date.now() / 1000));
  if (remainingTtl > 0) {
    await redis.setex(`blocklist:${jti}`, remainingTtl, '1');
  }
  await repo.deleteUserRefreshTokens(userId);
};

export const setupMfa = async (userId, tenantId) => {
  const user = await repo.findUserById(userId, tenantId);
  if (!user) throw new AppError('NOT_FOUND', 'User not found', 404);

  const secret = speakeasy.generateSecret({ name: 'RemitX', length: 20 });
  await repo.updateUser(userId, tenantId, { mfa_secret: secret.base32 });

  const qrUri = speakeasy.otpauthURL({
    secret: secret.base32,
    label: user.email,
    issuer: 'RemitX',
    encoding: 'base32',
  });

  return { secret: secret.base32, qrUri };
};

export const verifyMfa = async (userId, tenantId, code) => {
  const user = await repo.findUserById(userId, tenantId);
  if (!user || !user.mfa_secret) {
    throw new AppError('VALIDATION_ERROR', 'MFA setup not initiated', 400);
  }

  const valid = speakeasy.totp.verify({
    secret: user.mfa_secret,
    encoding: 'base32',
    token: code,
    window: 1,
  });
  if (!valid) throw new AppError('MFA_INVALID', 'Invalid MFA code', 401);

  await repo.updateUser(userId, tenantId, { mfa_enabled: true });
  return { success: true };
};

export const mfaChallenge = async ({ tempToken, code, tenantId }) => {
  let payload;
  try {
    payload = jwt.verify(tempToken, config.jwtPublicKey, { algorithms: ['RS256'] });
  } catch {
    throw new AppError('UNAUTHORIZED', 'Invalid or expired temp token', 401);
  }

  if (payload.purpose !== 'mfa_challenge') {
    throw new AppError('UNAUTHORIZED', 'Invalid token purpose', 401);
  }

  const user = await repo.findUserById(payload.sub, tenantId);
  if (!user) throw new AppError('NOT_FOUND', 'User not found', 404);

  const valid = speakeasy.totp.verify({
    secret: user.mfa_secret,
    encoding: 'base32',
    token: code,
    window: 1,
  });
  if (!valid) throw new AppError('MFA_INVALID', 'Invalid MFA code', 401);

  const permissions = await getUserPermissions(user.id, tenantId, user.role);
  const accessToken = issueAccessToken(user, permissions);
  const refreshToken = await issueRefreshToken(user.id, tenantId);
  await repo.updateUserLastLogin(user.id, tenantId);

  const { password_hash, mfa_secret, ...safeUser } = user;
  return { accessToken, refreshToken, user: safeUser };
};

export const passwordResetRequest = async (email, tenantId) => {
  const user = await repo.findUserByEmail(email, tenantId);
  if (user) {
    const token = randomToken(32);
    const hash = sha256(token);
    await redis.setex(`pwreset:${hash}`, 3600, user.id);
    logger.info({ email, action: 'password_reset_requested' }, 'Password reset token generated (dev: check logs)');
    // In production: send email with reset link containing token
    logger.info({ resetToken: token }, 'DEV ONLY: password reset token');
  }
  return { success: true };
};

export const passwordReset = async (token, password) => {
  const hash = sha256(token);
  const userId = await redis.get(`pwreset:${hash}`);
  if (!userId) {
    throw new AppError('UNAUTHORIZED', 'Invalid or expired reset token', 401);
  }

  const user = await db('users').where({ id: userId }).first();
  if (!user) throw new AppError('NOT_FOUND', 'User not found', 404);

  const history = await repo.getPasswordHistory(userId, 5);
  for (const { password_hash } of history) {
    const reused = await bcrypt.compare(password, password_hash);
    if (reused) throw new AppError('PASSWORD_REUSE', 'Cannot reuse a recent password', 422);
  }

  const newHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  await db.transaction(async (trx) => {
    await trx('users').where({ id: userId }).update({ password_hash: newHash, updated_at: new Date() });
    await repo.addPasswordHistory(userId, newHash, trx);
    await repo.deleteUserRefreshTokens(userId, trx);
  });

  await redis.del(`pwreset:${hash}`);
  await redis.del(`perms:${userId}`);

  return { success: true };
};

export const acceptInvite = async ({ token, password, firstName, lastName }) => {
  const userId = await redis.get(`invite:${token}`);
  if (!userId) {
    throw new AppError('INVITE_EXPIRED', 'Invalid or expired invite token', 401);
  }

  const newHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  await db.transaction(async (trx) => {
    await trx('users').where({ id: userId }).update({
      password_hash: newHash,
      first_name: firstName,
      last_name: lastName,
      status: 'active',
      updated_at: new Date(),
    });
    await repo.addPasswordHistory(userId, newHash, trx);
  });

  await redis.del(`invite:${token}`);
  return { success: true };
};

export const getMe = async (userId, tenantId) => {
  const user = await repo.findUserById(userId, tenantId);
  if (!user) throw new AppError('NOT_FOUND', 'User not found', 404);
  const { password_hash, mfa_secret, ...safeUser } = user;
  return safeUser;
};

export const updateProfile = async (userId, tenantId, { firstName, lastName }) => {
  const data = {};
  if (firstName !== undefined) data.first_name = firstName;
  if (lastName !== undefined) data.last_name = lastName;
  if (!Object.keys(data).length) throw new AppError('VALIDATION_ERROR', 'Nothing to update', 400);
  const [user] = await db('users')
    .where({ id: userId, tenant_id: tenantId })
    .update({ ...data, updated_at: new Date() })
    .returning(['id', 'email', 'first_name', 'last_name', 'role', 'status']);
  return user;
};

export const changePassword = async (userId, tenantId, currentPassword, newPassword) => {
  const user = await db('users').where({ id: userId, tenant_id: tenantId }).first();
  if (!user) throw new AppError('NOT_FOUND', 'User not found', 404);
  const valid = await bcrypt.compare(currentPassword, user.password_hash);
  if (!valid) throw new AppError('AUTH_ERROR', 'Current password is incorrect', 401);
  if (newPassword.length < 8) throw new AppError('VALIDATION_ERROR', 'Password must be at least 8 characters', 400);
  const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await db.transaction(async (trx) => {
    await trx('users').where({ id: userId, tenant_id: tenantId }).update({ password_hash: hash, updated_at: new Date() });
    await repo.addPasswordHistory(userId, hash, trx);
  });
};
