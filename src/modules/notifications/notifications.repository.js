import db from '../../config/database.js';

export const create = async (data, trx = db) => {
  const [row] = await trx('notifications').insert(data).returning('*');
  return row;
};

export const findById = async (id, userId, tenantId, trx = db) =>
  trx('notifications').where({ id, user_id: userId, tenant_id: tenantId }).first();

export const list = async ({ tenantId, userId, unreadOnly, page, limit }, trx = db) => {
  const query = trx('notifications').where({ tenant_id: tenantId, user_id: userId });
  if (unreadOnly) query.whereNull('read_at');
  query.orderBy('created_at', 'desc');

  const [{ count }] = await query.clone().clearOrder().count('* as count');
  const data = await query.limit(limit).offset((page - 1) * limit);
  return { data, total: parseInt(count, 10) };
};

export const markRead = async (id, userId, tenantId, trx = db) => {
  const [row] = await trx('notifications')
    .where({ id, user_id: userId, tenant_id: tenantId })
    .whereNull('read_at')
    .update({ read_at: new Date() })
    .returning('*');
  return row;
};

export const markAllRead = async (userId, tenantId, trx = db) =>
  trx('notifications')
    .where({ user_id: userId, tenant_id: tenantId })
    .whereNull('read_at')
    .update({ read_at: new Date() });

export const incrementAttemptCount = async (id, trx = db) =>
  trx('notifications').where({ id }).increment('attempt_count', 1);

export const countUnread = async (userId, tenantId, trx = db) => {
  const [{ count }] = await trx('notifications')
    .where({ user_id: userId, tenant_id: tenantId })
    .whereNull('read_at')
    .count('* as count');
  return parseInt(count, 10);
};
