import { Worker } from 'bullmq';
import { config } from '../config/index.js';
import { logger } from '../shared/utils/logger.js';
import db from '../config/database.js';
import { creditAccount } from '../modules/accounts/index.js';
import { assertTransition } from '../modules/payments/payments.stateMachine.js';
import { resolveProvider } from '../providers/ProviderRouter.js';

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

  const isManual = payment.provider_name === 'manual';
  const now = new Date();

  if (isManual) {
    // ManualAdapter: complete immediately — no external call needed
    assertTransition(payment.status, 'completed');
    await db.transaction(async (trx) => {
      await trx('payments')
        .where({ id: paymentId, tenant_id: tenantId })
        .update({ status: 'completed', provider_payment_id: `MAN-${paymentId}`, updated_at: now, completed_at: now });
      await trx('payment_status_history').insert({
        tenant_id: tenantId, payment_id: paymentId, status: 'completed',
        actor_type: 'system', notes: 'Completed via internal manual approval',
      });
    });
    logger.info({ paymentId, tenantId }, 'Payment auto-completed (manual adapter)');
    return;
  }

  // Real provider (e.g. Zoqq) — submit to provider and store external reference
  const provider = await resolveProvider(tenantId, payment.source_currency, payment.dest_currency);
  const providerResult = await provider.submitPayment({ payment, quote: null });

  const newStatus = providerResult.status === 'completed' ? 'completed' : 'pending_manual_processing';
  assertTransition(payment.status, newStatus);

  await db.transaction(async (trx) => {
    await trx('payments')
      .where({ id: paymentId, tenant_id: tenantId })
      .update({
        status: newStatus,
        provider_payment_id: providerResult.externalRef,
        updated_at: now,
        ...(newStatus === 'completed' && { completed_at: now }),
      });
    await trx('payment_status_history').insert({
      tenant_id: tenantId, payment_id: paymentId, status: newStatus,
      actor_type: 'system', notes: `Dispatched to ${payment.provider_name} — ref: ${providerResult.externalRef}`,
    });
  });

  logger.info({ paymentId, tenantId, newStatus, externalRef: providerResult.externalRef }, 'Payment dispatched to provider');
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
