import { Worker, Queue } from 'bullmq';
import { config } from '../config/index.js';
import { logger } from '../shared/utils/logger.js';
import { findDue } from '../modules/scheduledPayments/scheduledPayments.repository.js';
import { executeScheduledPayment, checkUpcomingBalanceAlerts } from '../modules/scheduledPayments/index.js';

const connection = { url: config.redisUrl };

const processJob = async (job) => {
  if (job.name === 'scheduled-payments.balance-check') {
    return checkUpcomingBalanceAlerts();
  }

  // 'scheduled-payments.check' — execute all due schedules
  const due = await findDue();
  if (due.length === 0) return;

  logger.info({ count: due.length }, 'Processing due scheduled payments');

  for (const scheduled of due) {
    try {
      await executeScheduledPayment(scheduled);
    } catch (err) {
      logger.error(
        { scheduledPaymentId: scheduled.id, tenantId: scheduled.tenant_id, err: err.message },
        'Failed to execute scheduled payment',
      );
    }
  }
};

export const scheduledPaymentWorker = new Worker(
  'scheduled-payment-queue',
  processJob,
  { connection, autorun: false },
);

scheduledPaymentWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, jobName: job?.name, err: err.message }, 'Scheduled payment job failed');
});

export const scheduleScheduledPaymentsCron = async () => {
  const queue = new Queue('scheduled-payment-queue', { connection });

  // Execution check — every minute
  await queue.add(
    'scheduled-payments.check',
    {},
    { repeat: { pattern: '* * * * *', tz: 'UTC' } },
  );

  // Balance-alert sweep — daily at 09:00 UTC
  await queue.add(
    'scheduled-payments.balance-check',
    {},
    { repeat: { pattern: '0 9 * * *', tz: 'UTC' } },
  );

  logger.info('Scheduled payment crons registered (exec: every min, balance check: 09:00 UTC)');
};
