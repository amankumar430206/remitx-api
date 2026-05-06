import db from '../../config/database.js';

const BENE_JOIN = (qb) =>
  qb
    .leftJoin('beneficiaries as b', 'payments.beneficiary_id', 'b.id')
    .select('payments.*', 'b.name as beneficiary_name', 'b.country_code as beneficiary_country_code');

export const create = async (data, trx = db) => {
  const [row] = await trx('payments').insert(data).returning('*');
  return row;
};

export const findById = async (id, tenantId, trx = db) =>
  BENE_JOIN(trx('payments')).where({ 'payments.id': id, 'payments.tenant_id': tenantId }).first();

export const findByIdempotencyKey = async (tenantId, idempotencyKey, trx = db) =>
  trx('payments').where({ tenant_id: tenantId, idempotency_key: idempotencyKey }).first();

export const update = async (id, tenantId, data, trx = db) => {
  const [row] = await trx('payments')
    .where({ id, tenant_id: tenantId })
    .update({ ...data, updated_at: new Date() })
    .returning('*');
  return row;
};

export const list = async ({ tenantId, userIds, status, page, limit }, trx = db) => {
  const query = BENE_JOIN(trx('payments')).where({ 'payments.tenant_id': tenantId });
  if (userIds && userIds.length > 0) query.whereIn('payments.user_id', userIds);
  if (status) query.andWhere({ 'payments.status': status });
  query.orderBy('payments.created_at', 'desc');

  const [{ count }] = await trx('payments')
    .where({ tenant_id: tenantId })
    .modify(q => {
      if (userIds && userIds.length > 0) q.whereIn('user_id', userIds);
      if (status) q.andWhere({ status });
    })
    .count('* as count');

  const offset = (page - 1) * limit;
  const data = await query.limit(limit).offset(offset);

  return { data, total: parseInt(count, 10) };
};

export const listApprovalQueue = async (tenantId, trx = db) =>
  BENE_JOIN(trx('payments'))
    .where({ 'payments.tenant_id': tenantId })
    .whereIn('payments.status', ['pending_approval', 'pending_compliance'])
    .orderBy('payments.created_at', 'asc');

export const insertStatusHistory = async (data, trx = db) => {
  const [row] = await trx('payment_status_history').insert(data).returning('*');
  return row;
};

export const getStatusHistory = async (paymentId, tenantId, trx = db) =>
  trx('payment_status_history')
    .where({ payment_id: paymentId, tenant_id: tenantId })
    .orderBy('created_at', 'asc');

export const resolveApprovalRule = async (amount, tenantId, trx = db) => {
  const rules = await trx('approval_rules')
    .where({ tenant_id: tenantId, is_active: true })
    .orderBy('priority', 'asc');

  const Big = (await import('big.js')).default;
  const amt = new Big(amount);

  for (const rule of rules) {
    const min = new Big(rule.min_amount);
    const maxOk = rule.max_amount === null || amt.lte(new Big(rule.max_amount));
    if (amt.gte(min) && maxOk) return rule;
  }

  return { auto_approve: false, required_approvals: 1 };
};
