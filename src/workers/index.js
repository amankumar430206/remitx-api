import { Worker } from 'bullmq';
import { config } from '../config/index.js';
import { logger } from '../shared/utils/logger.js';

const connection = { url: config.redisUrl };

// Payment worker — Phase 2+
export const paymentWorker = new Worker(
  'payments',
  async (job) => {
    logger.info({ jobId: job.id, data: job.data }, 'Processing payment job');
    // TODO Phase 2: implement payment processing
  },
  { connection, autorun: false },
);

paymentWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, 'Payment job failed');
});

export const startWorkers = () => {
  paymentWorker.run();
  logger.info('Workers started');
};
