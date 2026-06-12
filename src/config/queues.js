import { Queue } from 'bullmq';
import { config } from './index.js';

const connection = { url: config.redisUrl };
const defaultJobOptions = { removeOnComplete: { count: 1000 }, removeOnFail: { count: 5000 } };

export const paymentQueue = new Queue('payment-queue', { connection, defaultJobOptions });
export const notificationQueue = new Queue('notification-queue', { connection, defaultJobOptions });
export const webhookQueue = new Queue('webhook-queue', { connection, defaultJobOptions });
export const complianceQueue = new Queue('compliance-queue', { connection, defaultJobOptions });
export const reconciliationQueue    = new Queue('reconciliation-queue',     { connection, defaultJobOptions });
export const scheduledPaymentQueue = new Queue('scheduled-payment-queue', { connection, defaultJobOptions });
