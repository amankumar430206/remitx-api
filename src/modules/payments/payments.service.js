import { randomBytes } from 'crypto';
import db from '../../config/database.js';
import { AppError } from '../../shared/errors/AppError.js';
import { writeAudit } from '../../shared/utils/audit.js';
import { add, isGreaterThan } from '../../shared/utils/money.js';
import { debitAccount, creditAccount, getAccountBalance } from '../accounts/index.js';
import { getBeneficiaryOrThrow } from '../beneficiaries/index.js';
import { consumeFxQuote, lockQuote } from '../fx/index.js';
import { paymentQueue, notificationQueue } from '../../config/queues.js';
import { runAmlChecks } from '../compliance/index.js';
import { resolveFee } from '../admin/index.js';
import { resolveProviderName } from '../../providers/ProviderRouter.js';
import * as repo from './payments.repository.js';
import { assertTransition } from './payments.stateMachine.js';

const generateReference = () =>
  `RMX-${Date.now()}-${randomBytes(3).toString('hex').toUpperCase()}`;

const enqueueDispatch = (paymentId, tenantId) => {
  paymentQueue
    .add('payment.dispatch', { paymentId, tenantId }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    })
    .catch(() => {});
};

const enqueueNotification = (eventType, payload) => {
  notificationQueue.add(eventType, payload, { attempts: 3 }).catch(() => {});
};

// ─── Submit ──────────────────────────────────────────────────────────────────

export const submitPayment = async (payload, userId, tenantId, idempotencyKey, req) => {
  const { beneficiaryId, accountId, quoteId, purposeCode, note } = payload;

  // Idempotency check
  const existing = await repo.findByIdempotencyKey(tenantId, idempotencyKey);
  if (existing) return existing;

  // Validate beneficiary
  const beneficiary = await getBeneficiaryOrThrow(beneficiaryId, tenantId);

  // Consume FX quote (one-time use)
  const quote = await consumeFxQuote(quoteId, tenantId);

  // Validate account belongs to user and has sufficient balance
  const balance = await getAccountBalance(accountId, tenantId);
  if (balance === null) throw new AppError('NOT_FOUND', 'Account not found', 404);

  const [feeAmount, providerName] = await Promise.all([
    resolveFee(tenantId, quote.from, quote.to, quote.fromAmount, 'transaction_send'),
    resolveProviderName(tenantId, quote.from, quote.to),
  ]);
  const totalDebit = add(quote.fromAmount, feeAmount);

  if (!isGreaterThan(balance, '0') && !isGreaterThan(balance, totalDebit)) {
    throw new AppError('INSUFFICIENT_BALANCE', 'Insufficient account balance', 422);
  }
  if (isGreaterThan(totalDebit, balance)) {
    throw new AppError('INSUFFICIENT_BALANCE', 'Insufficient account balance', 422);
  }

  // AML screening
  const amlResult = await runAmlChecks({ sourceAmount: quote.fromAmount, userId }, tenantId);
  if (amlResult === 'block') {
    throw new AppError('AML_BLOCKED', 'Payment blocked by compliance screening', 422);
  }

  // Resolve approval rule
  const rule = await repo.resolveApprovalRule(quote.fromAmount, tenantId);
  const autoApprove = rule.auto_approve === true && amlResult === 'pass';
  const initialStatus = amlResult === 'flag' ? 'pending_compliance' : (autoApprove ? 'processing' : 'pending_approval');

  const paymentData = {
    tenant_id: tenantId,
    user_id: userId,
    beneficiary_id: beneficiaryId,
    account_id: accountId,
    source_currency: quote.from,
    source_amount: quote.fromAmount,
    dest_currency: quote.to,
    dest_amount: quote.toAmount,
    exchange_rate: quote.rate,
    fee_amount: feeAmount,
    purpose_code: purposeCode,
    reference: generateReference(),
    idempotency_key: idempotencyKey,
    quote_id: quoteId,
    provider_name: providerName,
    status: initialStatus,
    note: note || null,
  };

  const payment = await db.transaction(async (trx) => {
    const p = await repo.create(paymentData, trx);

    await repo.insertStatusHistory({
      tenant_id: tenantId,
      payment_id: p.id,
      status: initialStatus,
      actor_id: userId,
      actor_type: 'user',
      notes: amlResult === 'flag' ? 'Flagged by AML screening — pending compliance review' : (autoApprove ? 'Auto-approved by rule' : 'Submitted, awaiting approval'),
    }, trx);

    if (autoApprove) {
      await debitAccount({
        accountId,
        amount: totalDebit,
        paymentId: p.id,
        tenantId,
        description: `Payment ${p.reference}`,
      }, trx);
    }

    return p;
  });

  if (amlResult === 'flag') {
    enqueueNotification('payment.compliance_flagged', { paymentId: payment.id, tenantId });
  } else if (autoApprove) {
    enqueueDispatch(payment.id, tenantId);
  } else {
    enqueueNotification('payment.approval_required', { paymentId: payment.id, tenantId });
  }

  writeAudit({ tenantId, actorId: userId, action: 'payment.created', resourceType: 'payment', resourceId: payment.id, req });

  return payment;
};

// ─── Approve ─────────────────────────────────────────────────────────────────

export const approvePayment = async (paymentId, tenantId, checkerId, checkerRole, req) => {
  const payment = await repo.findById(paymentId, tenantId);
  if (!payment) throw new AppError('NOT_FOUND', 'Payment not found', 404);

  const tid = payment.tenant_id;
  assertTransition(payment.status, 'processing');

  // Super admins may approve their own payments (admin override)
  if (payment.user_id === checkerId && checkerRole !== 'super_admin') {
    throw new AppError('SELF_APPROVAL', 'Maker cannot approve their own payment', 403);
  }

  const rule = await repo.resolveApprovalRule(payment.source_amount, tid);
  const requiredApprovals = rule.required_approvals ?? 1;

  // Dual approval: first checker sets checker_id, second finalises
  if (requiredApprovals >= 2 && !payment.checker_id) {
    const updated = await db.transaction(async (trx) => {
      const p = await repo.update(paymentId, tid, { checker_id: checkerId }, trx);
      await repo.insertStatusHistory({
        tenant_id: tid,
        payment_id: paymentId,
        status: 'pending_approval',
        actor_id: checkerId,
        actor_type: 'user',
        notes: 'First approval granted — awaiting second checker',
      }, trx);
      return p;
    });
    enqueueNotification('payment.first_approval', { paymentId, tenantId: tid });
    writeAudit({ tenantId: tid, actorId: checkerId, action: 'payment.first_approved', resourceType: 'payment', resourceId: paymentId, req });
    return updated;
  }

  // If dual and a checker is already set, the second checker must be different
  if (payment.checker_id && payment.checker_id !== checkerId && requiredApprovals >= 2) {
    // Second checker finalises
  } else if (payment.checker_id && payment.checker_id === checkerId) {
    throw new AppError('CONFLICT', 'Same checker cannot provide both approvals', 409);
  }

  // Final approval — debit and dispatch
  const feeAmount = payment.fee_amount ?? '0.00000000';
  const totalDebit = add(String(payment.source_amount), String(feeAmount));

  const updated = await db.transaction(async (trx) => {
    const p = await repo.update(paymentId, tid, {
      status: 'processing',
      checker_id: checkerId,
    }, trx);

    await repo.insertStatusHistory({
      tenant_id: tid,
      payment_id: paymentId,
      status: 'processing',
      actor_id: checkerId,
      actor_type: 'user',
      notes: 'Approved',
    }, trx);

    await debitAccount({
      accountId: payment.account_id,
      amount: totalDebit,
      paymentId,
      tenantId: tid,
      description: `Payment ${payment.reference}`,
    }, trx);

    return p;
  });

  enqueueDispatch(paymentId, tid);
  enqueueNotification('payment.approved', { paymentId, tenantId: tid });
  writeAudit({ tenantId: tid, actorId: checkerId, action: 'payment.approved', resourceType: 'payment', resourceId: paymentId, req });

  return updated;
};

// ─── Reject ───────────────────────────────────────────────────────────────────

export const rejectPayment = async (paymentId, tenantId, checkerId, reason, req) => {
  const payment = await repo.findById(paymentId, tenantId);
  if (!payment) throw new AppError('NOT_FOUND', 'Payment not found', 404);

  const tid = payment.tenant_id;
  assertTransition(payment.status, 'rejected');

  const updated = await db.transaction(async (trx) => {
    const p = await repo.update(paymentId, tid, { status: 'rejected' }, trx);
    await repo.insertStatusHistory({
      tenant_id: tid,
      payment_id: paymentId,
      status: 'rejected',
      actor_id: checkerId,
      actor_type: 'user',
      notes: reason,
    }, trx);
    return p;
  });

  enqueueNotification('payment.rejected', { paymentId, tenantId: tid, reason });
  writeAudit({ tenantId: tid, actorId: checkerId, action: 'payment.rejected', resourceType: 'payment', resourceId: paymentId, req });

  return updated;
};

// ─── Cancel ───────────────────────────────────────────────────────────────────

export const cancelPayment = async (paymentId, tenantId, userId, req) => {
  const payment = await repo.findById(paymentId, tenantId);
  if (!payment) throw new AppError('NOT_FOUND', 'Payment not found', 404);

  assertTransition(payment.status, 'cancelled');

  if (payment.user_id !== userId) {
    throw new AppError('FORBIDDEN', 'Only the payment initiator can cancel', 403);
  }

  const updated = await db.transaction(async (trx) => {
    const p = await repo.update(paymentId, tenantId, { status: 'cancelled' }, trx);
    await repo.insertStatusHistory({
      tenant_id: tenantId,
      payment_id: paymentId,
      status: 'cancelled',
      actor_id: userId,
      actor_type: 'user',
      notes: 'Cancelled by initiator',
    }, trx);
    return p;
  });

  writeAudit({ tenantId, actorId: userId, action: 'payment.cancelled', resourceType: 'payment', resourceId: paymentId, req });
  return updated;
};

// ─── Submit on behalf (admin) ─────────────────────────────────────────────────

export const submitPaymentOnBehalf = async (targetUserId, { beneficiaryId, accountId, from, to, amount, purposeCode, note }, actorId, req) => {
  const targetUser = await db('users').where({ id: targetUserId }).first();
  if (!targetUser) throw new AppError('NOT_FOUND', 'Target user not found', 404);

  // Lock FX quote scoped to the target tenant — consumeFxQuote enforces tenantId match
  const quote = await lockQuote(targetUser.tenant_id, from.toUpperCase(), to.toUpperCase(), String(amount));

  const idempotencyKey = `admin-onbehalf-${actorId}-${Date.now()}`;
  const payment = await submitPayment(
    { beneficiaryId, accountId, quoteId: quote.quoteId, purposeCode, note },
    targetUser.id,
    targetUser.tenant_id,
    idempotencyKey,
    req,
  );

  writeAudit({ tenantId: targetUser.tenant_id, actorId, action: 'payment.created_on_behalf', resourceType: 'payment', resourceId: payment.id, req });
  return { payment, createdFor: { id: targetUser.id, email: targetUser.email } };
};

// ─── Read ─────────────────────────────────────────────────────────────────────

export const getPayment = async (paymentId, tenantId) => {
  const payment = await repo.findById(paymentId, tenantId);
  if (!payment) throw new AppError('NOT_FOUND', 'Payment not found', 404);
  const history = await repo.getStatusHistory(paymentId, payment.tenant_id);
  return { ...payment, status_history: history };
};

export const listPayments = async (tenantId, userIds, { page = 1, limit = 20, status, direction, search, from, to } = {}) => {
  // All payments in this system are outgoing debits — credit filter returns empty
  if (direction === 'credit') return { data: [], meta: { page, limit, total: 0 } };
  const { data, total } = await repo.list({ tenantId, userIds, status, search, from, to, page, limit });
  return {
    data,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasMore: page * limit < total,
    },
  };
};

export const listApprovalQueue = async (tenantId) => {
  const data = await repo.listApprovalQueue(tenantId);
  return data;
};
