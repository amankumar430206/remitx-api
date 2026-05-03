import { Worker } from 'bullmq';
import { config } from '../config/index.js';
import { logger } from '../shared/utils/logger.js';
import { paymentWorker } from './payment.worker.js';
import { webhookWorker } from './webhook.worker.js';
import { complianceWorker } from './compliance.worker.js';

export { paymentWorker, webhookWorker, complianceWorker };

export const startWorkers = () => {
  paymentWorker.run();
  webhookWorker.run();
  complianceWorker.run();
  logger.info('Workers started');
};
