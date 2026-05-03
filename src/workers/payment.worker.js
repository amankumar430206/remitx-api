import { Worker } from 'bullmq';
import { config } from '../config/index.js';
import { logger } from '../shared/utils/logger.js';
import db from '../config/database.js';
import { creditAccount } from '../modules/accounts/index.js';
import { assertTransition } from '../modules/payments/payments.stateMachine.js';

const connection = { url: config.redisUrl };

const processDispatch = async (job) => {
  const { paymentId, tenantId } = job.data;

  const payment = await db('payments').where({ id: paymentId, tenant_id: tenantId }).first();
  if (!payment) {
    logger.warn({ paymentId }, 'Payment not found for dispatch — skipping');
    return;
  }

  if (payment.status !== 'processing') {
    logger.warn({ paymentId, status: payment.status }, 'Payment not in processing state — skipping dispatch');
    return;
  }

  // ManualAdapter: set to pending_manual_processing
  const newStatus = 'pending_manual_processing';
  assertTransition(payment.status, newStatus);

  await db.transaction(async (trx) => {
    await trx('payments')
      .where({ id: paymentId, tenant_id: tenantId })
      .update({ status: newStatus, provider_name: 'manual', provider_payment_id: `MAN-${paymentId}`, updated_at: new Date() });

    await trx('payment_status_history').insert({
      tenant_id: tenantId,
      payment_id: paymentId,
      status: newStatus,
      actor_type: 'system',
      notes: 'Dispatched to manual processing queue',
    });
  });

  logger.info({ paymentId, tenantId }, 'Payment dispatched to manual processing');
};

const handlePermanentFailure = async (paymentId, tenantId, errorMsg) => {
  const payment = await db('payments').where({ id: paymentId, tenant_id: tenantId }).first();
  if (!payment || payment.status === 'failed') return;

  await db.transaction(async (trx) => {
    await trx('payments')
      .where({ id: paymentId, tenant_id: tenantId })
      .update({ status: 'failed', updated_at: new Date() });

    await trx('payment_status_history').insert({
      tenant_id: tenantId,
      payment_id: paymentId,
      status: 'failed',
      actor_type: 'system',
      notes: `Permanent failure: ${errorMsg}`,
    });

    // Reverse the debit
    await creditAccount({
      accountId: payment.account_id,
      amount: String(payment.source_amount),
      paymentId,
      tenantId,
      description: `Reversal for failed payment ${payment.reference}`,
    }, trx);
  });

  logger.error({ paymentId, tenantId, errorMsg }, 'Payment permanently failed — debit reversed');
};

export const paymentWorker = new Worker(
  'payment-queue',
  processDispatch,
  { connection, autorun: false },
);

paymentWorker.on('failed', async (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, 'Payment dispatch job failed');

  // On permanent failure (all retries exhausted)
  if (job && job.attemptsMade >= (job.opts?.attempts ?? 3)) {
    const { paymentId, tenantId } = job.data;
    await handlePermanentFailure(paymentId, tenantId, err.message).catch(() => {});
  }
});
