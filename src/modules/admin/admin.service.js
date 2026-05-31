import { randomBytes } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import db from '../../config/database.js';
import redis from '../../config/redis.js';
import { config } from '../../config/index.js';
import { AppError } from '../../shared/errors/AppError.js';
import { writeAudit } from '../../shared/utils/audit.js';
import { multiply, divide, isLessThan, isGreaterThan } from '../../shared/utils/money.js';
import { creditAccount } from '../accounts/index.js';
import { insertStatusHistory } from '../payments/index.js';
import { seedRoleDefaults, getTenantTheme, getGlobalTheme, updateTheme, resetTenantTheme } from '../tenants/index.js';
import { getKycDocumentFile } from '../compliance/index.js';
import * as repo from './admin.repository.js';

// ─── Tenant management ────────────────────────────────────────────────────────

export const listTenants = async () => repo.listTenants();

export const getTenant = async (id) => {
  const tenant = await repo.findTenantById(id);
  if (!tenant) throw new AppError('NOT_FOUND', 'Tenant not found', 404);
  return tenant;
};

export const createTenant = async ({ slug, name, adminEmail }, actorId, req) => {
  return db.transaction(async (trx) => {
    // 1. Create tenant
    const tenant = await repo.createTenant({ slug, name, status: 'active' }, trx);

    // 2. Seed theme config defaults
    await repo.createThemeConfig(tenant.id, trx);

    // 3. Seed role permissions
    await seedRoleDefaults(tenant.id, trx);

    // 4. Seed approval rules
    await repo.seedApprovalRules(tenant.id, trx);

    // 5. Create client_admin user (invited)
    const passwordHash = await bcrypt.hash(uuidv4(), 10);
    const [adminUser] = await trx('users').insert({
      tenant_id: tenant.id,
      email: adminEmail,
      role: 'client_admin',
      password_hash: passwordHash,
      status: 'invited',
      kyc_status: 'pending',
    }).returning('*');

    // 6. Store invite token (72h)
    const inviteToken = randomBytes(32).toString('hex');
    await redis.setex(`invite:${inviteToken}`, 72 * 3600, adminUser.id);

    writeAudit({ tenantId: tenant.id, actorId, action: 'tenant.created', resourceType: 'tenant', resourceId: tenant.id, req });

    const { password_hash, mfa_secret, ...safeUser } = adminUser;
    return { tenant, adminUser: safeUser, inviteToken };
  });
};

export const updateTenant = async (id, data, actorId, req) => {
  const tenant = await repo.updateTenant(id, data);
  if (!tenant) throw new AppError('NOT_FOUND', 'Tenant not found', 404);
  writeAudit({ tenantId: id, actorId, action: 'tenant.updated', resourceType: 'tenant', resourceId: id, req });
  return tenant;
};

export const updateTenantStatus = async (id, status, actorId, req) => {
  const VALID = ['active', 'suspended', 'inactive'];
  if (!VALID.includes(status)) throw new AppError('VALIDATION_ERROR', `status must be one of: ${VALID.join(', ')}`, 400);
  return updateTenant(id, { status }, actorId, req);
};

export const listTenantUsers = async (id) => {
  await getTenant(id); // ensure exists
  return repo.listTenantUsers(id);
};

export const listTenantBeneficiaries = async (tenantId) => {
  await getTenant(tenantId);
  return repo.listTenantBeneficiaries(tenantId);
};

export const listTenantAccounts = async (tenantId) => {
  await getTenant(tenantId);
  return repo.listTenantAccounts(tenantId);
};

export const getTenantContact = async (id) => {
  await getTenant(id); // ensure exists
  const contact = await repo.getTenantContact(id);
  return contact ?? null;
};

// ─── Fee config ───────────────────────────────────────────────────────────────

const computeFee = (config, amount) => {
  if (!config) return '0.00000000';
  if (config.fee_type === 'flat') return String(config.fee_value);

  // percent: fee_value is the rate (e.g. 0.5 means 0.5%)
  let fee = multiply(String(amount), divide(String(config.fee_value), '100'));
  if (config.min_fee !== null && isLessThan(fee, String(config.min_fee))) fee = String(config.min_fee);
  if (config.max_fee !== null && isGreaterThan(fee, String(config.max_fee))) fee = String(config.max_fee);
  return fee;
};

export const resolveFee = async (tenantId, sourceCurrency, destCurrency, amount) => {
  const config = await repo.resolveFeeConfig(tenantId, sourceCurrency, destCurrency);
  return computeFee(config, amount);
};

export const previewFee = async (tenantId, sourceCurrency, destCurrency, amount) => {
  const config = await repo.resolveFeeConfig(tenantId, sourceCurrency, destCurrency);
  const feeAmount = computeFee(config, amount);
  return { feeAmount, configured: !!config };
};

export const listFeeConfigs = async (tenantId) => {
  await getTenant(tenantId); // ensure tenant exists
  return repo.listFeeConfigs(tenantId);
};

export const createFeeConfig = async (tenantId, data, actorId, req) => {
  await getTenant(tenantId);

  const row = await repo.createFeeConfig({
    tenant_id: tenantId,
    source_currency: data.sourceCurrency.toUpperCase(),
    dest_currency: data.destCurrency ? data.destCurrency.toUpperCase() : null,
    fee_type: data.feeType,
    fee_value: data.feeValue,
    min_fee: data.minFee ?? null,
    max_fee: data.maxFee ?? null,
    is_active: true,
  });

  writeAudit({ tenantId, actorId, action: 'fee_config.created', resourceType: 'fee_config', resourceId: row.id, req });
  return row;
};

export const updateFeeConfig = async (tenantId, feeId, data, actorId, req) => {
  const updates = {};
  if (data.feeType  !== undefined) updates.fee_type  = data.feeType;
  if (data.feeValue !== undefined) updates.fee_value  = data.feeValue;
  if (data.minFee   !== undefined) updates.min_fee    = data.minFee ?? null;
  if (data.maxFee   !== undefined) updates.max_fee    = data.maxFee ?? null;
  if (data.isActive !== undefined) updates.is_active  = data.isActive;

  const row = await repo.updateFeeConfig(feeId, tenantId, updates);
  if (!row) throw new AppError('NOT_FOUND', 'Fee config not found', 404);

  writeAudit({ tenantId, actorId, action: 'fee_config.updated', resourceType: 'fee_config', resourceId: feeId, req });
  return row;
};

export const deleteFeeConfig = async (tenantId, feeId, actorId, req) => {
  const existing = await repo.findFeeConfig(feeId, tenantId);
  if (!existing) throw new AppError('NOT_FOUND', 'Fee config not found', 404);

  await repo.deleteFeeConfig(feeId, tenantId);
  writeAudit({ tenantId, actorId, action: 'fee_config.deleted', resourceType: 'fee_config', resourceId: feeId, req });
};

// ─── Provider corridor config ─────────────────────────────────────────────────

export const getProviderConfig = async (tenantId) => repo.getCorridorConfigs(tenantId);

export const updateProviderConfig = async (tenantId, corridors, actorId, req) => {
  if (!Array.isArray(corridors)) throw new AppError('VALIDATION_ERROR', 'corridors must be an array', 400);

  await db.transaction(async (trx) => {
    for (const corridor of corridors) {
      await repo.upsertCorridorConfig(tenantId, corridor, trx);
    }
  });

  // Invalidate routing cache for this tenant
  await redis.del(`tenant:routing:${tenantId}`);
  writeAudit({ tenantId, actorId, action: 'provider_config.updated', resourceType: 'tenant', resourceId: tenantId, req });

  return repo.getCorridorConfigs(tenantId);
};

export const addSingleCorridorConfig = async (tenantId, corridor, actorId, req) => {
  await getTenant(tenantId);
  const row = await repo.upsertCorridorConfig(tenantId, corridor);
  // Invalidate per-corridor routing cache keys for this tenant
  await redis.del(`tenant:routing:${tenantId}:${corridor.sourceCurrency.toUpperCase()}:${corridor.destCurrency?.toUpperCase() || 'any'}`);
  await redis.del(`tenant:routing:${tenantId}:${corridor.sourceCurrency.toUpperCase()}:any`);
  writeAudit({ tenantId, actorId, action: 'provider_config.corridor_added', resourceType: 'tenant', resourceId: tenantId, req });
  return row;
};

export const removeSingleCorridorConfig = async (tenantId, corridorId, actorId, req) => {
  await getTenant(tenantId);
  const deleted = await repo.deleteCorridorById(corridorId, tenantId);
  if (!deleted) throw new AppError('NOT_FOUND', 'Corridor not found', 404);
  // Broad cache bust for this tenant's routing
  const keys = await redis.keys(`tenant:routing:${tenantId}:*`);
  if (keys.length) await redis.del(...keys);
  writeAudit({ tenantId, actorId, action: 'provider_config.corridor_removed', resourceType: 'tenant', resourceId: tenantId, req });
};

// ─── Global provider defaults ─────────────────────────────────────────────────

export const getGlobalProviderConfig = async () => repo.getGlobalCorridorConfigs();

export const addGlobalCorridorConfig = async (corridor, actorId, req) => {
  const platformTenantId = await repo.getPlatformTenantId();
  if (!platformTenantId) throw new AppError('NOT_FOUND', 'Platform tenant not configured', 500);
  const row = await repo.upsertCorridorConfig(platformTenantId, corridor);
  // Bust any routing cache that might have used global fallback (can't enumerate, so partial)
  writeAudit({ tenantId: platformTenantId, actorId, action: 'global_provider_config.corridor_added', resourceType: 'tenant', resourceId: platformTenantId, req });
  return row;
};

export const removeGlobalCorridorConfig = async (corridorId, actorId, req) => {
  const platformTenantId = await repo.getPlatformTenantId();
  if (!platformTenantId) throw new AppError('NOT_FOUND', 'Platform tenant not configured', 500);
  const deleted = await repo.deleteCorridorById(corridorId, platformTenantId);
  if (!deleted) throw new AppError('NOT_FOUND', 'Corridor not found', 404);
  writeAudit({ tenantId: platformTenantId, actorId, action: 'global_provider_config.corridor_removed', resourceType: 'tenant', resourceId: platformTenantId, req });
};

// ─── Manual payment queue ─────────────────────────────────────────────────────

export const getManualQueue = async () => repo.listManualQueue();

export const processPayment = async (paymentId, { action, notes, providerRef }, actorId, req) => {
  if (!['complete', 'fail'].includes(action)) {
    throw new AppError('VALIDATION_ERROR', 'action must be complete or fail', 400);
  }

  const payment = await repo.getPaymentById(paymentId);
  if (!payment) throw new AppError('NOT_FOUND', 'Payment not found', 404);
  if (payment.status !== 'pending_manual_processing') {
    throw new AppError('INVALID_STATUS', 'Payment is not in pending_manual_processing status', 422);
  }

  return db.transaction(async (trx) => {
    const now = new Date();
    let updatedPayment;

    if (action === 'complete') {
      updatedPayment = await repo.processManualPayment(paymentId, payment.tenant_id, {
        status: 'completed',
        completed_at: now,
        provider_payment_id: providerRef || null,
        ops_notes: notes || null,
      }, trx);

      await insertStatusHistory({
        payment_id: paymentId,
        tenant_id: payment.tenant_id,
        status: 'completed',
        actor_id: actorId,
        actor_type: 'ops',
        notes: notes || null,
      }, trx);
    } else {
      updatedPayment = await repo.processManualPayment(paymentId, payment.tenant_id, {
        status: 'failed',
        ops_notes: notes || null,
      }, trx);

      await insertStatusHistory({
        payment_id: paymentId,
        tenant_id: payment.tenant_id,
        status: 'failed',
        actor_id: actorId,
        actor_type: 'ops',
        notes: notes || null,
      }, trx);

      // Reverse the debit — credit account back
      if (payment.account_id) {
        await creditAccount({
          accountId: payment.account_id,
          amount: payment.source_amount,
          paymentId,
          tenantId: payment.tenant_id,
          description: `Reversal: ${payment.reference}`,
        }, trx);
      }
    }

    writeAudit({ tenantId: payment.tenant_id, actorId, action: `payment.${action}d`, resourceType: 'payment', resourceId: paymentId, req });
    return updatedPayment;
  });
};

// ─── Per-client branding ──────────────────────────────────────────────────────

export const getGlobalThemeForAdmin = async () => getGlobalTheme();

export const getClientTheme = async (tenantId) => {
  const tenant = await repo.findTenantById(tenantId);
  if (!tenant) throw new AppError('NOT_FOUND', 'Tenant not found', 404);
  return getTenantTheme(tenantId);
};

export const updateClientTheme = async (tenantId, payload) => {
  const tenant = await repo.findTenantById(tenantId);
  if (!tenant) throw new AppError('NOT_FOUND', 'Tenant not found', 404);
  return updateTheme(tenantId, payload);
};

export const resetClientTheme = async (tenantId) => {
  const tenant = await repo.findTenantById(tenantId);
  if (!tenant) throw new AppError('NOT_FOUND', 'Tenant not found', 404);
  return resetTenantTheme(tenantId);
};

// ─── Cross-tenant views ───────────────────────────────────────────────────────

export const listAllPayments = async ({ page = 1, limit = 20, tenantId, status, providerName, from, to }) => {
  const { data, total } = await repo.listAllPayments({ page, limit, tenantId, status, providerName, from, to });
  return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

export const listReconciliationExceptions = async () =>
  repo.listAllReconciliationExceptions();

export const listApprovalQueueAll = async (tenantId) =>
  repo.listApprovalQueueAll(tenantId || null);

// ─── Impersonation ────────────────────────────────────────────────────────────

export const impersonateUser = async (targetUserId, actorId, actorTenantId, req) => {
  const user = await db('users').where({ id: targetUserId }).first();
  if (!user) throw new AppError('NOT_FOUND', 'User not found', 404);

  // Fetch permissions for target user's role in their tenant
  const rawPerms = await db('role_permissions')
    .where({ tenant_id: user.tenant_id, role: user.role })
    .select('permission');
  const permissions = rawPerms.map((r) => r.permission);

  // Issue short-lived 5-min impersonation token (no refresh)
  const jti = uuidv4();
  const token = jwt.sign(
    { sub: user.id, tenantId: user.tenant_id, role: user.role, permissions, jti, impersonatedBy: actorId },
    config.jwtPrivateKey,
    { algorithm: 'RS256', expiresIn: '5m' },
  );

  writeAudit({ tenantId: actorTenantId, actorId, action: 'user.impersonated', resourceType: 'user', resourceId: targetUserId, req });

  return { token, expiresIn: '5m', targetUser: { id: user.id, email: user.email, role: user.role, tenantId: user.tenant_id } };
};

// ─── KYC document file serving (admin) ───────────────────────────────────────

/** Serve a KYC document file on behalf of an admin viewing a specific tenant user. */
export const adminGetKycDocumentFile = async (tenantId, userId, storedAs) => {
  const tenant = await repo.findTenantById(tenantId);
  if (!tenant) throw new AppError('NOT_FOUND', 'Tenant not found', 404);
  // Delegate to compliance service — same logic, but admin supplies the target userId
  return getKycDocumentFile(userId, tenantId, storedAs);
};
