import { Worker } from 'bullmq';
import { config } from '../config/index.js';
import { logger } from '../shared/utils/logger.js';
import db from '../config/database.js';

const connection = { url: config.redisUrl };

const processJob = async (job) => {
  const { name, data } = job;

  // beneficiary.screen — auto-clear for manual MVP
  if (name === 'beneficiary.screen') {
    const { beneficiaryId, tenantId } = data;
    await db('beneficiaries')
      .where({ id: beneficiaryId, tenant_id: tenantId })
      .update({ screening_status: 'clear', updated_at: new Date() });
    logger.info({ beneficiaryId, tenantId }, 'Beneficiary screening cleared');
    return;
  }

  // kyc.submitted — log for admin visibility (notifications handled by notification worker)
  if (name === 'kyc.submitted') {
    logger.info({ userId: data.userId, tenantId: data.tenantId }, 'KYC application submitted — awaiting admin review');
    return;
  }

  // kyc.approved / kyc.rejected — log outcome
  if (name === 'kyc.approved' || name === 'kyc.rejected') {
    logger.info({ userId: data.userId, tenantId: data.tenantId, event: name }, 'KYC status updated');
    return;
  }

  // payment.compliance_flagged — log for compliance team
  if (name === 'payment.compliance_flagged') {
    logger.info({ paymentId: data.paymentId, tenantId: data.tenantId }, 'Payment flagged by AML — pending compliance review');
    return;
  }

  logger.warn({ jobName: name }, 'Unknown compliance job — skipping');
};

export const complianceWorker = new Worker(
  'compliance-queue',
  processJob,
  { connection, autorun: false },
);

complianceWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, 'Compliance job failed');
});
