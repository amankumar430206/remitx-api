import path from 'path';
import { mkdirSync } from 'fs';
import db from '../../config/database.js';
import { AppError } from '../../shared/errors/AppError.js';
import { writeAudit } from '../../shared/utils/audit.js';
import { notificationQueue } from '../../config/queues.js';
import * as repo from './compliance.repository.js';

const enqueueNotification = (eventType, payload) => {
  notificationQueue.add(eventType, payload, { attempts: 3 }).catch(() => {});
};

// ─── KYC: user-facing ────────────────────────────────────────────────────────

export const initiateKyc = async (userId, tenantId, req) => {
  const existing = await repo.findKycByUser(userId, tenantId);
  if (existing) {
    if (existing.status === 'approved') {
      throw new AppError('CONFLICT', 'KYC already approved', 409);
    }
    return existing;
  }

  const application = await repo.createKyc({
    tenant_id: tenantId,
    user_id: userId,
    status: 'pending',
    documents: JSON.stringify([]),
  });

  writeAudit({ tenantId, actorId: userId, action: 'kyc.initiated', resourceType: 'kyc_application', resourceId: application.id, req });
  return application;
};

export const getKycStatus = async (userId, tenantId) => {
  const application = await repo.findKycByUser(userId, tenantId);
  const user = await db('users').where({ id: userId, tenant_id: tenantId }).first();

  return {
    kycStatus: user.kyc_status,
    kycExpiresAt: user.kyc_expires_at,
    application: application || null,
  };
};

export const uploadKycDocument = async (userId, tenantId, file, docType, req) => {
  if (!file) throw new AppError('VALIDATION_ERROR', 'No file uploaded', 400);

  const application = await repo.findKycByUser(userId, tenantId);
  if (!application) throw new AppError('NOT_FOUND', 'KYC application not found — initiate first', 404);
  if (application.status === 'approved') throw new AppError('CONFLICT', 'KYC already approved', 409);

  const uploadDir = path.join(process.cwd(), 'uploads', tenantId, userId);
  mkdirSync(uploadDir, { recursive: true });

  const docEntry = {
    type: docType || null,
    filename: file.originalname,
    storedAs: file.filename,
    mimetype: file.mimetype,
    size: file.size,
    uploadedAt: new Date().toISOString(),
  };

  const existing = Array.isArray(application.documents) ? application.documents : [];
  const updated = await repo.updateKycByUser(userId, tenantId, {
    documents: JSON.stringify([...existing, docEntry]),
    status: 'submitted',
  });

  enqueueNotification('kyc.submitted', { userId, tenantId, applicationId: application.id });
  writeAudit({ tenantId, actorId: userId, action: 'kyc.document_uploaded', resourceType: 'kyc_application', resourceId: application.id, req });

  return updated;
};

// ─── Compliance queue: flagged payments ──────────────────────────────────────

export const listComplianceQueue = async (tenantId) =>
  repo.listFlaggedPayments(tenantId);

export const clearPayment = async (paymentId, tenantId, actorId, notes, req) => {
  const payment = await db('payments').where({ id: paymentId, tenant_id: tenantId }).first();
  if (!payment) throw new AppError('NOT_FOUND', 'Payment not found', 404);
  if (payment.status !== 'pending_compliance') {
    throw new AppError('INVALID_STATE', 'Payment is not pending compliance review', 422);
  }

  const [updated] = await db.transaction(async (trx) => {
    const [p] = await trx('payments')
      .where({ id: paymentId, tenant_id: tenantId })
      .update({ status: 'processing', updated_at: new Date() })
      .returning('*');

    await trx('payment_status_history').insert({
      tenant_id: tenantId,
      payment_id: paymentId,
      status: 'processing',
      actor_id: actorId,
      actor_type: 'user',
      notes: notes || 'Cleared by compliance officer',
    });

    return [p];
  });

  writeAudit({ tenantId, actorId, action: 'compliance.payment_cleared', resourceType: 'payment', resourceId: paymentId, req });
  return updated;
};

export const blockPayment = async (paymentId, tenantId, actorId, reason, req) => {
  const payment = await db('payments').where({ id: paymentId, tenant_id: tenantId }).first();
  if (!payment) throw new AppError('NOT_FOUND', 'Payment not found', 404);
  if (payment.status !== 'pending_compliance') {
    throw new AppError('INVALID_STATE', 'Payment is not pending compliance review', 422);
  }

  const [updated] = await db.transaction(async (trx) => {
    const [p] = await trx('payments')
      .where({ id: paymentId, tenant_id: tenantId })
      .update({ status: 'rejected', updated_at: new Date() })
      .returning('*');

    await trx('payment_status_history').insert({
      tenant_id: tenantId,
      payment_id: paymentId,
      status: 'rejected',
      actor_id: actorId,
      actor_type: 'user',
      notes: reason,
    });

    return [p];
  });

  writeAudit({ tenantId, actorId, action: 'compliance.payment_blocked', resourceType: 'payment', resourceId: paymentId, req });
  return updated;
};

// ─── AML checks (called from payments service) ───────────────────────────────

export const runAmlChecks = async (payment, tenantId) => {
  const { default: Big } = await import('big.js');
  const amount = new Big(payment.sourceAmount);

  const velocity = await repo.sumPayments24h(payment.userId, tenantId);
  const velocity24h = new Big(velocity);

  const checks = [
    { id: 'LARGE_AMOUNT', condition: amount.gt(new Big(25000)), action: 'flag' },
    { id: 'VELOCITY_24H', condition: velocity24h.plus(amount).gt(new Big(50000)), action: 'flag' },
    { id: 'ROUND_AMOUNT', condition: amount.mod(1000).eq(0) && amount.gte(new Big(10000)), action: 'flag' },
  ];

  const triggered = checks.filter((c) => c.condition);
  if (triggered.some((c) => c.action === 'block')) return 'block';
  if (triggered.some((c) => c.action === 'flag')) return 'flag';
  return 'pass';
};

// ─── Admin: KYC approve/reject ───────────────────────────────────────────────

export const approveKyc = async (targetUserId, tenantId, adminId, req) => {
  const application = await repo.findKycByUser(targetUserId, tenantId);
  if (!application) throw new AppError('NOT_FOUND', 'KYC application not found', 404);
  if (application.status === 'approved') throw new AppError('CONFLICT', 'KYC already approved', 409);

  const expiresAt = new Date();
  expiresAt.setFullYear(expiresAt.getFullYear() + 2);

  await db.transaction(async (trx) => {
    await trx('users')
      .where({ id: targetUserId, tenant_id: tenantId })
      .update({ kyc_status: 'approved', kyc_expires_at: expiresAt, updated_at: new Date() });

    await repo.updateKycByUser(targetUserId, tenantId, {
      status: 'approved',
      reviewed_by: adminId,
      reviewed_at: new Date(),
    }, trx);
  });

  enqueueNotification('kyc.approved', { userId: targetUserId, tenantId });
  writeAudit({ tenantId, actorId: adminId, action: 'kyc.approved', resourceType: 'kyc_application', resourceId: application.id, req });

  return { userId: targetUserId, kycStatus: 'approved', kycExpiresAt: expiresAt };
};

export const rejectKyc = async (targetUserId, tenantId, adminId, reason, req) => {
  const application = await repo.findKycByUser(targetUserId, tenantId);
  if (!application) throw new AppError('NOT_FOUND', 'KYC application not found', 404);

  await db.transaction(async (trx) => {
    await trx('users')
      .where({ id: targetUserId, tenant_id: tenantId })
      .update({ kyc_status: 'rejected', updated_at: new Date() });

    await repo.updateKycByUser(targetUserId, tenantId, {
      status: 'rejected',
      reviewed_by: adminId,
      reviewed_at: new Date(),
      rejection_reason: reason,
    }, trx);
  });

  enqueueNotification('kyc.rejected', { userId: targetUserId, tenantId, reason });
  writeAudit({ tenantId, actorId: adminId, action: 'kyc.rejected', resourceType: 'kyc_application', resourceId: application.id, req });

  return { userId: targetUserId, kycStatus: 'rejected' };
};

export const listKycQueue = async (tenantId) =>
  repo.listKycQueue(tenantId);
