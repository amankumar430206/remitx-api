import { randomBytes } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import db from '../../config/database.js';
import redis from '../../config/redis.js';
import { config } from '../../config/index.js';
import { AppError } from '../../shared/errors/AppError.js';
import { writeAudit } from '../../shared/utils/audit.js';
import { creditAccount } from '../accounts/index.js';
import { insertStatusHistory } from '../payments/index.js';
import { seedRoleDefaults } from '../tenants/index.js';
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

// ─── Cross-tenant views ───────────────────────────────────────────────────────

export const listAllPayments = async ({ page = 1, limit = 20, tenantId, status }) => {
  const { data, total } = await repo.listAllPayments({ page, limit, tenantId, status });
  return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

export const listReconciliationExceptions = async () =>
  repo.listAllReconciliationExceptions();

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
