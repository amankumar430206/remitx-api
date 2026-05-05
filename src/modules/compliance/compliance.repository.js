import db from '../../config/database.js';

// ─── KYC Applications ────────────────────────────────────────────────────────

export const findKycByUser = async (userId, tenantId, trx = db) =>
  trx('kyc_applications').where({ user_id: userId, tenant_id: tenantId }).first();

export const createKyc = async (data, trx = db) => {
  const [row] = await trx('kyc_applications').insert(data).returning('*');
  return row;
};

export const updateKyc = async (id, tenantId, data, trx = db) => {
  const [row] = await trx('kyc_applications')
    .where({ id, tenant_id: tenantId })
    .update({ ...data, updated_at: new Date() })
    .returning('*');
  return row;
};

export const updateKycByUser = async (userId, tenantId, data, trx = db) => {
  const [row] = await trx('kyc_applications')
    .where({ user_id: userId, tenant_id: tenantId })
    .update({ ...data, updated_at: new Date() })
    .returning('*');
  return row;
};

export const listKycQueue = async (tenantId, trx = db) =>
  trx('kyc_applications as k')
    .join('users as u', 'u.id', 'k.user_id')
    .where('k.tenant_id', tenantId)
    .whereIn('k.status', ['submitted', 'pending'])
    .select(
      'k.id',
      'k.user_id',
      'k.status',
      'k.documents',
      'k.created_at',
      'k.updated_at',
      'u.email',
      'u.first_name',
      'u.last_name',
    )
    .orderBy('k.created_at', 'asc');

export const findKycById = async (id, tenantId, trx = db) =>
  trx('kyc_applications').where({ id, tenant_id: tenantId }).first();

// ─── Compliance queue (flagged payments) ─────────────────────────────────────

export const listFlaggedPayments = async (tenantId, trx = db) =>
  trx('payments')
    .where({ tenant_id: tenantId, status: 'pending_compliance' })
    .orderBy('created_at', 'asc');

export const sumPayments24h = async (userId, tenantId, trx = db) => {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [{ total }] = await trx('payments')
    .where({ tenant_id: tenantId, user_id: userId })
    .whereIn('status', ['processing', 'completed', 'pending_approval', 'pending_compliance'])
    .where('created_at', '>=', since)
    .sum('source_amount as total');
  return total ? String(total) : '0';
};
