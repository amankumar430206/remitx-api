import { logger } from '../shared/utils/logger.js';
import { paymentWorker } from './payment.worker.js';
import { webhookWorker } from './webhook.worker.js';
import { complianceWorker } from './compliance.worker.js';
import { notificationWorker } from './notification.worker.js';
import { reconciliationWorker, scheduleReconciliationCron } from './reconciliation.worker.js';
import { scheduledPaymentWorker, scheduleScheduledPaymentsCron } from './scheduledPayment.worker.js';

export { paymentWorker, webhookWorker, complianceWorker, notificationWorker, reconciliationWorker, scheduledPaymentWorker };

export const startWorkers = async () => {
  paymentWorker.run();
  webhookWorker.run();
  complianceWorker.run();
  notificationWorker.run();
  reconciliationWorker.run();
  scheduledPaymentWorker.run();
  await scheduleReconciliationCron();
  await scheduleScheduledPaymentsCron();
  logger.info('Workers started');
};
