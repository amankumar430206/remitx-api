import db from '../../config/database.js';
import { logger } from './logger.js';

export const writeAudit = async ({
  tenantId,
  actorId = null,
  actorType = 'user',
  action,
  resourceType = null,
  resourceId = null,
  before = null,
  after = null,
  metadata = null,
  req = null,
}) => {
  try {
    await db('audit_logs').insert({
      tenant_id: tenantId,
      actor_id: actorId,
      actor_type: actorType,
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      ip_address: req?.ip || null,
      user_agent: req?.headers?.['user-agent'] || null,
      before: before ? JSON.stringify(before) : null,
      after: after ? JSON.stringify(after) : null,
      metadata: metadata ? JSON.stringify(metadata) : null,
      created_at: new Date(),
    });
  } catch (err) {
    logger.error({ err: err.message, action }, 'Failed to write audit log');
  }
};
