import { v4 as uuidv4 } from 'uuid';
import db from '../../config/database.js';
import { AppError } from '../../shared/errors/AppError.js';
import { logger } from '../../shared/utils/logger.js';
import { lockQuote } from '../fx/index.js';
import { submitPayment } from '../payments/index.js';
import * as repo from './scheduledPayments.repository.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const nextExecutionDate = (from, frequency) => {
  const d = new Date(from);
  if (frequency === 'weekly')  d.setDate(d.getDate() + 7);
  if (frequency === 'monthly') d.setMonth(d.getMonth() + 1);
  return d;
};

// ─── Public API ───────────────────────────────────────────────────────────────

export const createScheduledPayment = async (payload, userId, tenantId) => {
  const data = {
    tenant_id:      tenantId,
    user_id:        userId,
    beneficiary_id: payload.beneficiaryId,
    account_id:     payload.accountId,
    source_currency: payload.sourceCurrency,
    dest_currency:   payload.destCurrency,
    source_amount:   payload.sourceAmount,
    purpose_code:    payload.purposeCode,
    note:            payload.note ?? null,
    frequency:       payload.frequency,
    scheduled_for:   new Date(payload.scheduledFor),
    end_date:        payload.endDate ? new Date(payload.endDate) : null,
    status:          'active',
  };

  return repo.create(data);
};

export const listScheduledPayments = async (tenantId, userId, filters) => {
  return repo.list({ tenantId, userId, ...filters });
};

export const getScheduledPayment = async (id, tenantId) => {
  const row = await repo.findById(id, tenantId);
  if (!row) throw new AppError('NOT_FOUND', 'Scheduled payment not found', 404);
  return row;
};

export const cancelScheduledPayment = async (id, tenantId, userId) => {
  const row = await repo.findById(id, tenantId);
  if (!row) throw new AppError('NOT_FOUND', 'Scheduled payment not found', 404);

  if (row.user_id !== userId) {
    throw new AppError('FORBIDDEN', 'Only the creator can cancel a scheduled payment', 403);
  }
  if (row.status !== 'active') {
    throw new AppError('INVALID_STATE', `Cannot cancel a scheduled payment with status "${row.status}"`, 422);
  }

  return repo.update(id, tenantId, { status: 'cancelled' });
};

export const updateScheduledPayment = async (id, tenantId, userId, changes) => {
  const row = await repo.findById(id, tenantId);
  if (!row) throw new AppError('NOT_FOUND', 'Scheduled payment not found', 404);

  if (row.user_id !== userId) {
    throw new AppError('FORBIDDEN', 'Only the creator can modify a scheduled payment', 403);
  }
  if (row.status !== 'active') {
    throw new AppError('INVALID_STATE', 'Only active scheduled payments can be modified', 422);
  }

  const patch = {};
  if (changes.scheduledFor) patch.scheduled_for = new Date(changes.scheduledFor);
  if (changes.endDate !== undefined) patch.end_date = changes.endDate ? new Date(changes.endDate) : null;
  if (changes.note !== undefined) patch.note = changes.note ?? null;

  return repo.update(id, tenantId, patch);
};

// ─── Worker entry point ───────────────────────────────────────────────────────

export const executeScheduledPayment = async (scheduled) => {
  const { id, tenant_id: tenantId, user_id: userId } = scheduled;

  logger.info({ scheduledPaymentId: id, tenantId }, 'Executing scheduled payment');

  // Lock a fresh FX quote at current market rate
  const quote = await lockQuote(
    tenantId,
    scheduled.source_currency,
    scheduled.dest_currency,
    String(scheduled.source_amount),
  );

  const idempotencyKey = `scheduled-${id}-exec-${scheduled.execution_count + 1}`;

  // Minimal worker context — submitPayment uses this for requestId in audit logs
  const workerReq = { id: `worker-${idempotencyKey}`, user: { sub: userId, tenantId } };

  let payment;
  try {
    payment = await submitPayment(
      {
        beneficiaryId: scheduled.beneficiary_id,
        accountId:     scheduled.account_id,
        quoteId:       quote.quoteId,
        purposeCode:   scheduled.purpose_code,
        note:          scheduled.note,
      },
      userId,
      tenantId,
      idempotencyKey,
      workerReq,
    );
  } catch (err) {
    // Mark schedule as failed for this run and let the worker surface it
    logger.error({ scheduledPaymentId: id, err: err.message }, 'Scheduled payment execution failed');
    throw err;
  }

  // Advance schedule
  const now      = new Date();
  const isOnce   = scheduled.frequency === 'once';
  const pastEnd  = scheduled.end_date && now >= new Date(scheduled.end_date);
  const isDone   = isOnce || pastEnd;

  const nextScheduledFor = isDone ? null : nextExecutionDate(scheduled.scheduled_for, scheduled.frequency);

  await repo.update(id, tenantId, {
    execution_count:  scheduled.execution_count + 1,
    last_executed_at: now,
    last_payment_id:  payment.id,
    scheduled_for:    nextScheduledFor ?? scheduled.scheduled_for,
    status:           isDone ? 'completed' : 'active',
  });

  logger.info({ scheduledPaymentId: id, paymentId: payment.id, isDone }, 'Scheduled payment executed');
  return payment;
};
