import { logger } from '../shared/utils/logger.js';
import { paymentWorker } from './payment.worker.js';
import { webhookWorker } from './webhook.worker.js';
import { complianceWorker } from './compliance.worker.js';
import { notificationWorker } from './notification.worker.js';
import { reconciliationWorker, scheduleReconciliationCron } from './reconciliation.worker.js';

export { paymentWorker, webhookWorker, complianceWorker, notificationWorker, reconciliationWorker };

export const startWorkers = async () => {
  paymentWorker.run();
  webhookWorker.run();
  complianceWorker.run();
  notificationWorker.run();
  reconciliationWorker.run();
  await scheduleReconciliationCron();
  logger.info('Workers started');
};
