import { Worker } from 'bullmq';
import { config } from '../config/index.js';
import { logger } from '../shared/utils/logger.js';
import db from '../config/database.js';

const connection = { url: config.redisUrl };

const processScreening = async (job) => {
  const { beneficiaryId, tenantId } = job.data;

  // Phase 3 stub: simulate screening delay then auto-clear
  await new Promise((resolve) => setTimeout(resolve, 100));

  const [updated] = await db('beneficiaries')
    .where({ id: beneficiaryId, tenant_id: tenantId })
    .update({ screening_status: 'clear', updated_at: new Date() })
    .returning('id');

  if (updated) {
    logger.info({ beneficiaryId, tenantId }, 'Beneficiary screening cleared');
  }
};

export const complianceWorker = new Worker(
  'compliance-queue',
  processScreening,
  { connection, autorun: false },
);

complianceWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, 'Compliance job failed');
});
