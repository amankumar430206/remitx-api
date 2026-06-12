import { Worker, Queue } from 'bullmq';
import { config } from '../config/index.js';
import { logger } from '../shared/utils/logger.js';
import { findDue } from '../modules/scheduledPayments/scheduledPayments.repository.js';
import { executeScheduledPayment } from '../modules/scheduledPayments/index.js';

const connection = { url: config.redisUrl };

const processCheck = async () => {
  const due = await findDue();
  if (due.length === 0) return;

  logger.info({ count: due.length }, 'Processing due scheduled payments');

  for (const scheduled of due) {
    try {
      await executeScheduledPayment(scheduled);
    } catch (err) {
      // Log and continue — one failure must not block the others
      logger.error(
        { scheduledPaymentId: scheduled.id, tenantId: scheduled.tenant_id, err: err.message },
        'Failed to execute scheduled payment',
      );
    }
  }
};

export const scheduledPaymentWorker = new Worker(
  'scheduled-payment-queue',
  processCheck,
  { connection, autorun: false },
);

scheduledPaymentWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, 'Scheduled payment check job failed');
});

// Registers a repeating cron that fires the check every minute
export const scheduleScheduledPaymentsCron = async () => {
  const queue = new Queue('scheduled-payment-queue', { connection });
  await queue.add(
    'scheduled-payments.check',
    {},
    { repeat: { pattern: '* * * * *', tz: 'UTC' } },
  );
  logger.info('Scheduled payment cron registered (every minute)');
};
