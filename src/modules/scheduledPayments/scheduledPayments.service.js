import Big from 'big.js';
import { v4 as uuidv4 } from 'uuid';
import { AppError } from '../../shared/errors/AppError.js';
import { logger } from '../../shared/utils/logger.js';
import { lockQuote } from '../fx/index.js';
import { submitPayment } from '../payments/index.js';
import { getAccountBalance } from '../accounts/index.js';
import { notificationQueue } from '../../config/queues.js';
import * as repo from './scheduledPayments.repository.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const nextExecutionDate = (from, frequency) => {
  const d = new Date(from);
  if (frequency === 'weekly')  d.setDate(d.getDate() + 7);
  if (frequency === 'monthly') d.setMonth(d.getMonth() + 1);
  return d;
};

const daysUntil = (date) =>
  Math.ceil((new Date(date) - Date.now()) / (24 * 60 * 60 * 1000));

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export const createScheduledPayment = async (payload, userId, tenantId) => {
  return repo.create({
    tenant_id:       tenantId,
    user_id:         userId,
    beneficiary_id:  payload.beneficiaryId,
    account_id:      payload.accountId,
    source_currency: payload.sourceCurrency,
    dest_currency:   payload.destCurrency,
    source_amount:   payload.sourceAmount,
    purpose_code:    payload.purposeCode,
    note:            payload.note ?? null,
    frequency:       payload.frequency,
    scheduled_for:   new Date(payload.scheduledFor),
    end_date:        payload.endDate ? new Date(payload.endDate) : null,
    status:          'active',
  });
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
  if (row.user_id !== userId) throw new AppError('FORBIDDEN', 'Only the creator can cancel a scheduled payment', 403);
  if (row.status !== 'active') throw new AppError('INVALID_STATE', `Cannot cancel a scheduled payment with status "${row.status}"`, 422);
  return repo.update(id, tenantId, { status: 'cancelled' });
};

export const updateScheduledPayment = async (id, tenantId, userId, changes) => {
  const row = await repo.findById(id, tenantId);
  if (!row) throw new AppError('NOT_FOUND', 'Scheduled payment not found', 404);
  if (row.user_id !== userId) throw new AppError('FORBIDDEN', 'Only the creator can modify a scheduled payment', 403);
  if (row.status !== 'active') throw new AppError('INVALID_STATE', 'Only active scheduled payments can be modified', 422);

  const patch = {};
  if (changes.scheduledFor) patch.scheduled_for = new Date(changes.scheduledFor);
  if (changes.endDate !== undefined) patch.end_date = changes.endDate ? new Date(changes.endDate) : null;
  if (changes.note !== undefined) patch.note = changes.note ?? null;

  return repo.update(id, tenantId, patch);
};

// ─── Skip current occurrence ─────────────────────────────────────────────────

export const skipScheduledPayment = async (id, tenantId, userId) => {
  const row = await repo.findById(id, tenantId);
  if (!row) throw new AppError('NOT_FOUND', 'Scheduled payment not found', 404);
  if (row.user_id !== userId) throw new AppError('FORBIDDEN', 'Only the creator can skip a scheduled payment', 403);
  if (row.status !== 'active') throw new AppError('INVALID_STATE', `Cannot skip a scheduled payment with status "${row.status}"`, 422);
  if (row.frequency === 'once') throw new AppError('INVALID_STATE', 'Cannot skip a one-time payment — cancel it instead', 422);

  const nextDate = nextExecutionDate(row.scheduled_for, row.frequency);
  const pastEnd  = row.end_date && nextDate >= new Date(row.end_date);

  return repo.update(id, tenantId, {
    scheduled_for:          nextDate,
    status:                 pastEnd ? 'completed' : 'active',
    balance_insufficient:   false,
    balance_alert_last_day: null,
  });
};

// ─── Manual execute now ───────────────────────────────────────────────────────

export const executeScheduledPaymentNow = async (id, tenantId, userId) => {
  const row = await repo.findById(id, tenantId);
  if (!row) throw new AppError('NOT_FOUND', 'Scheduled payment not found', 404);
  if (row.status !== 'active') throw new AppError('INVALID_STATE', `Cannot execute a scheduled payment with status "${row.status}"`, 422);
  const payment = await executeScheduledPayment(row);
  if (!payment) throw new AppError('INSUFFICIENT_BALANCE', 'Account balance is insufficient for this payment', 422);
  return { scheduled: await repo.findById(id, tenantId), payment };
};

// ─── Worker: execute a due scheduled payment ─────────────────────────────────

export const executeScheduledPayment = async (scheduled) => {
  const { id, tenant_id: tenantId, user_id: userId } = scheduled;

  // Balance check before touching FX quote
  const balance = await getAccountBalance(scheduled.account_id, tenantId);
  const required = new Big(scheduled.source_amount);

  if (new Big(balance).lt(required)) {
    await repo.update(id, tenantId, { balance_insufficient: true });
    logger.warn({ scheduledPaymentId: id, balance, required: required.toFixed(8) }, 'Scheduled payment skipped — insufficient balance');
    // Notification queued by the daily balance-alert cron (avoids duplicate on execution day)
    return null;
  }

  // Clear flag if it was previously set
  if (scheduled.balance_insufficient) {
    await repo.update(id, tenantId, { balance_insufficient: false, balance_alert_last_day: null });
  }

  logger.info({ scheduledPaymentId: id, tenantId }, 'Executing scheduled payment');

  const quote = await lockQuote(
    tenantId,
    scheduled.source_currency,
    scheduled.dest_currency,
    String(scheduled.source_amount),
  );

  const idempotencyKey = `scheduled-${id}-exec-${scheduled.execution_count + 1}`;
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
    logger.error({ scheduledPaymentId: id, err: err.message }, 'Scheduled payment execution failed');
    throw err;
  }

  const now     = new Date();
  const isOnce  = scheduled.frequency === 'once';
  const pastEnd = scheduled.end_date && now >= new Date(scheduled.end_date);
  const isDone  = isOnce || pastEnd;

  await repo.update(id, tenantId, {
    execution_count:       scheduled.execution_count + 1,
    last_executed_at:      now,
    last_payment_id:       payment.id,
    scheduled_for:         isDone ? scheduled.scheduled_for : nextExecutionDate(scheduled.scheduled_for, scheduled.frequency),
    status:                isDone ? 'completed' : 'active',
    balance_insufficient:  false,
    balance_alert_last_day: null,
  });

  logger.info({ scheduledPaymentId: id, paymentId: payment.id, isDone }, 'Scheduled payment executed');
  return payment;
};

// ─── Worker: daily balance-alert sweep ───────────────────────────────────────

export const checkUpcomingBalanceAlerts = async () => {
  const upcoming = await repo.findUpcoming(5);
  if (upcoming.length === 0) return;

  logger.info({ count: upcoming.length }, 'Running scheduled payment balance alert check');

  for (const scheduled of upcoming) {
    try {
      const days = daysUntil(scheduled.scheduled_for);
      if (days < 1 || days > 5) continue;

      // Skip if we already sent this exact countdown alert today
      if (scheduled.balance_alert_last_day === days) continue;

      const balance = await getAccountBalance(scheduled.account_id, scheduled.tenant_id);
      const insufficient = new Big(balance).lt(new Big(scheduled.source_amount));

      if (insufficient) {
        await repo.update(scheduled.id, scheduled.tenant_id, {
          balance_insufficient:  true,
          balance_alert_last_day: days,
        });

        await notificationQueue.add('scheduled_payment.insufficient_funds', {
          tenantId:            scheduled.tenant_id,
          userId:              scheduled.user_id,
          scheduledPaymentId:  scheduled.id,
          amount:              scheduled.source_amount,
          currency:            scheduled.source_currency,
          daysRemaining:       days,
        }, { attempts: 3, backoff: { type: 'exponential', delay: 2000 } });

      } else if (scheduled.balance_insufficient) {
        // Balance now sufficient — clear the alert
        await repo.update(scheduled.id, scheduled.tenant_id, {
          balance_insufficient:  false,
          balance_alert_last_day: null,
        });
      }
    } catch (err) {
      logger.error({ scheduledPaymentId: scheduled.id, err: err.message }, 'Balance alert check failed for schedule');
    }
  }
};
