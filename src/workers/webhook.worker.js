import { Worker } from 'bullmq';
import { config } from '../config/index.js';
import { logger } from '../shared/utils/logger.js';
import redis from '../config/redis.js';
import db from '../config/database.js';
import { creditAccount } from '../modules/accounts/index.js';
import { assertTransition } from '../modules/payments/payments.stateMachine.js';

const connection = { url: config.redisUrl };

const processWebhook = async (job) => {
  const { provider, eventId, eventType, paymentId, tenantId } = job.data;

  // Idempotency: skip if already processed
  const idempotencyKey = `webhook:${provider}:${eventId}`;
  const alreadyProcessed = await redis.set(idempotencyKey, '1', 'EX', 86400, 'NX');
  if (!alreadyProcessed) {
    logger.info({ eventId, provider }, 'Webhook event already processed — skipping');
    return;
  }

  const payment = await db('payments').where({ id: paymentId, tenant_id: tenantId }).first();
  if (!payment) {
    logger.warn({ paymentId, provider }, 'Payment not found for webhook event');
    return;
  }

  if (eventType === 'payment.completed') {
    assertTransition(payment.status, 'completed');

    await db.transaction(async (trx) => {
      await trx('payments')
        .where({ id: paymentId, tenant_id: tenantId })
        .update({ status: 'completed', completed_at: new Date(), updated_at: new Date() });

      await trx('payment_status_history').insert({
        tenant_id: tenantId,
        payment_id: paymentId,
        status: 'completed',
        actor_type: 'system',
        notes: `Completed via ${provider} webhook`,
      });
    });

    logger.info({ paymentId, provider }, 'Payment marked completed via webhook');
  } else if (eventType === 'payment.failed') {
    assertTransition(payment.status, 'failed');

    await db.transaction(async (trx) => {
      await trx('payments')
        .where({ id: paymentId, tenant_id: tenantId })
        .update({ status: 'failed', updated_at: new Date() });

      await trx('payment_status_history').insert({
        tenant_id: tenantId,
        payment_id: paymentId,
        status: 'failed',
        actor_type: 'system',
        notes: `Failed via ${provider} webhook`,
      });

      await creditAccount({
        accountId: payment.account_id,
        amount: String(payment.source_amount),
        paymentId,
        tenantId,
        description: `Reversal for failed payment ${payment.reference}`,
      }, trx);
    });

    logger.info({ paymentId, provider }, 'Payment failed via webhook — debit reversed');
  }
};

export const webhookWorker = new Worker(
  'webhook-queue',
  processWebhook,
  { connection, autorun: false },
);

webhookWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, 'Webhook processing job failed');
});
