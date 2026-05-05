import { logger } from '../shared/utils/logger.js';
import { paymentWorker } from './payment.worker.js';
import { webhookWorker } from './webhook.worker.js';
import { complianceWorker } from './compliance.worker.js';
import { notificationWorker } from './notification.worker.js';

export { paymentWorker, webhookWorker, complianceWorker, notificationWorker };

export const startWorkers = () => {
  paymentWorker.run();
  webhookWorker.run();
  complianceWorker.run();
  notificationWorker.run();
  logger.info('Workers started');
};
