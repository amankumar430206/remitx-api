import db from '../../config/database.js';

export const create = async (data, trx = db) => {
  const [row] = await (trx)('beneficiaries').insert(data).returning('*');
  return row;
};

export const findById = async (id, tenantId, trx = db) =>
  trx('beneficiaries').where({ id, tenant_id: tenantId, is_active: true }).first();

export const findByIdIncludingInactive = async (id, tenantId, trx = db) =>
  trx('beneficiaries').where({ id, tenant_id: tenantId }).first();

export const list = async ({ tenantId, userIds, page, limit }, trx = db) => {
  const query = trx('beneficiaries')
    .where({ tenant_id: tenantId, is_active: true });
  if (userIds && userIds.length > 0) query.whereIn('user_id', userIds);
  query.orderBy('created_at', 'desc');

  const [{ count }] = await query.clone().clearOrder().count('* as count');
  const offset = (page - 1) * limit;
  const data = await query.limit(limit).offset(offset);

  return { data, total: parseInt(count, 10) };
};

export const update = async (id, tenantId, data, trx = db) => {
  const [row] = await (trx)('beneficiaries')
    .where({ id, tenant_id: tenantId, is_active: true })
    .update({ ...data, updated_at: new Date() })
    .returning('*');
  return row;
};

export const softDelete = async (id, tenantId, trx = db) => {
  const [row] = await (trx)('beneficiaries')
    .where({ id, tenant_id: tenantId, is_active: true })
    .update({ is_active: false, updated_at: new Date() })
    .returning('*');
  return row;
};
