import db from '../../config/database.js';
import { paginate } from '../../shared/utils/pagination.js';

export const create = async (data, trx = db) => {
  const [row] = await trx('scheduled_payments').insert(data).returning('*');
  return row;
};

export const findById = async (id, tenantId, trx = db) => {
  return trx('scheduled_payments')
    .where({ id, tenant_id: tenantId })
    .first();
};

export const list = async ({ tenantId, userId, status, page = 1, limit = 20 }, trx = db) => {
  const query = trx('scheduled_payments')
    .where({ tenant_id: tenantId })
    .orderBy('scheduled_for', 'asc');

  if (userId)  query.where({ user_id: userId });
  if (status)  query.where({ status });

  return paginate(query, { page, limit });
};

// Worker uses this to pull all active schedules due for execution
export const findDue = async (trx = db) => {
  return trx('scheduled_payments')
    .where({ status: 'active' })
    .where('scheduled_for', '<=', new Date())
    .select('*');
};

export const update = async (id, tenantId, data, trx = db) => {
  const [row] = await trx('scheduled_payments')
    .where({ id, tenant_id: tenantId })
    .update({ ...data, updated_at: new Date() })
    .returning('*');
  return row;
};
