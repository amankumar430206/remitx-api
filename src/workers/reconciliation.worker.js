import { Worker, Queue } from 'bullmq';
import { config } from '../config/index.js';
import { logger } from '../shared/utils/logger.js';
import db from '../config/database.js';
import { notificationQueue } from '../config/queues.js';
import { upsertReconciliationReport, getCompletedPaymentsForDate } from '../modules/reporting/index.js';

const connection = { url: config.redisUrl };

// ─── Reconcile a single tenant for a given date ──────────────────────────────

export const reconcileTenant = async (tenantId, date) => {
  const payments = await getCompletedPaymentsForDate(tenantId, date);

  const exceptions = [];
  let matchedCount = 0;

  for (const payment of payments) {
    // ManualAdapter: all payments with a provider_payment_id are considered matched
    if (payment.provider_payment_id) {
      matchedCount++;
    } else {
      exceptions.push({
        paymentId: payment.id,
        reference: payment.reference,
        reason: 'No provider_payment_id — unmatched',
        amount: payment.source_amount,
        currency: payment.source_currency,
      });
    }
  }

  const { default: Big } = await import('big.js');
  const totalAmount = payments.reduce(
    (acc, p) => acc.plus(new Big(p.source_amount || 0)),
    new Big(0),
  ).toFixed(8);

  const status = exceptions.length > 0 ? 'exceptions' : 'matched';

  const report = await upsertReconciliationReport({
    tenant_id: tenantId,
    report_date: date,
    total_payments: payments.length,
    total_amount: totalAmount,
    matched_count: matchedCount,
    unmatched_count: exceptions.length,
    exceptions: JSON.stringify(exceptions),
    status,
  });

  if (exceptions.length > 0) {
    await notificationQueue
      .add('payment.manual_pending', { tenantId, date, exceptionCount: exceptions.length }, { attempts: 3 })
      .catch(() => {});
  }

  logger.info({ tenantId, date, status, matched: matchedCount, exceptions: exceptions.length }, 'Reconciliation complete');
  return report;
};

// ─── Daily job processor ─────────────────────────────────────────────────────

const processReconciliation = async (job) => {
  const date = job.data.date || new Date(Date.now() - 86400_000).toISOString().slice(0, 10);

  const tenants = await db('tenants').where({ status: 'active' }).select('id');
  logger.info({ date, tenantCount: tenants.length }, 'Starting daily reconciliation');

  for (const { id: tenantId } of tenants) {
    await reconcileTenant(tenantId, date).catch((err) => {
      logger.error({ tenantId, date, err: err.message }, 'Reconciliation failed for tenant');
    });
  }
};

export const reconciliationWorker = new Worker(
  'reconciliation-queue',
  processReconciliation,
  { connection, autorun: false },
);

reconciliationWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, 'Reconciliation job failed');
});

// ─── Schedule daily cron at 02:00 UTC ────────────────────────────────────────

export const scheduleReconciliationCron = async () => {
  const queue = new Queue('reconciliation-queue', { connection });
  await queue.add(
    'reconciliation.daily',
    {},
    { repeat: { pattern: '0 2 * * *', tz: 'UTC' } },
  );
  logger.info('Reconciliation cron scheduled for 02:00 UTC');
};
