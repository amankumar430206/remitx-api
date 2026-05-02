import db from '../../config/database.js';
import { logger } from './logger.js';

export const writeAudit = ({
  tenantId,
  actorId = null,
  actorType = 'user',
  action,
  resourceType = null,
  resourceId = null,
  ipAddress = null,
  userAgent = null,
  before = null,
  after = null,
  metadata = null,
  req = null,
}) => {
  const payload = {
    tenant_id: tenantId,
    actor_id: actorId,
    actor_type: actorType,
    action,
    resource_type: resourceType,
    resource_id: resourceId,
    ip_address: ipAddress || req?.ip || null,
    user_agent: userAgent || req?.get('user-agent') || null,
    before: before ? JSON.stringify(before) : null,
    after: after ? JSON.stringify(after) : null,
    metadata: metadata ? JSON.stringify(metadata) : null,
  };

  db('audit_logs').insert(payload).catch((err) => {
    logger.error({ err: err.message, action }, 'Failed to write audit log');
  });
};
