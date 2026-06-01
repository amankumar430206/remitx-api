import db from '../../config/database.js';

const BENE_JOIN = (qb) =>
  qb
    .leftJoin('beneficiaries as b', 'payments.beneficiary_id', 'b.id')
    .select('payments.*', 'b.name as beneficiary_name', 'b.country_code as beneficiary_country_code');

export const create = async (data, trx = db) => {
  const [row] = await trx('payments').insert(data).returning('*');
  return row;
};

/** Full detail join — used for single-payment fetches only. */
export const findById = async (id, tenantId, trx = db) => {
  const q = trx('payments as p')
    .leftJoin('beneficiaries as b',        'p.beneficiary_id', 'b.id')
    .leftJoin('users as submitter',        'p.user_id',        'submitter.id')
    .leftJoin('users as checker_user',     'p.checker_id',     'checker_user.id')
    .leftJoin('accounts as acct',          'p.account_id',     'acct.id')
    .select(
      'p.*',
      // Beneficiary
      'b.name             as beneficiary_name',
      'b.country_code     as beneficiary_country_code',
      'b.bank_name        as beneficiary_bank_name',
      'b.account_number   as beneficiary_account_number',
      'b.iban             as beneficiary_iban',
      'b.swift_bic        as beneficiary_swift_bic',
      'b.currency         as beneficiary_currency',
      // Submitter
      'submitter.email      as submitter_email',
      'submitter.first_name as submitter_first_name',
      'submitter.last_name  as submitter_last_name',
      // Checker / approver
      'checker_user.email      as checker_email',
      'checker_user.first_name as checker_first_name',
      'checker_user.last_name  as checker_last_name',
      // Source account
      'acct.currency       as account_currency',
      'acct.account_number as account_number_ref',
    )
    .where({ 'p.id': id });
  if (tenantId) q.andWhere({ 'p.tenant_id': tenantId });
  return q.first();
};

export const findByIdempotencyKey = async (tenantId, idempotencyKey, trx = db) =>
  trx('payments').where({ tenant_id: tenantId, idempotency_key: idempotencyKey }).first();

export const update = async (id, tenantId, data, trx = db) => {
  const [row] = await trx('payments')
    .where({ id, tenant_id: tenantId })
    .update({ ...data, updated_at: new Date() })
    .returning('*');
  return row;
};

export const list = async ({ tenantId, userIds, status, search, from, to, page, limit }, trx = db) => {
  // Shared filter logic applied to both data and count queries
  const applyFilters = (q) => {
    q.where({ 'payments.tenant_id': tenantId });
    if (userIds?.length) q.whereIn('payments.user_id', userIds);
    if (status) q.andWhere({ 'payments.status': status });
    if (search) {
      const term = `%${search}%`;
      q.andWhere(sub => sub
        .whereILike('b.name', term)
        .orWhereILike('payments.reference', term),
      );
    }
    if (from) q.andWhere('payments.created_at', '>=', new Date(from));
    if (to) {
      const toEnd = new Date(to);
      toEnd.setHours(23, 59, 59, 999);
      q.andWhere('payments.created_at', '<=', toEnd);
    }
  };

  // Data query — always has beneficiary join via BENE_JOIN
  const dataQuery = BENE_JOIN(trx('payments'));
  applyFilters(dataQuery);
  dataQuery.orderBy('payments.created_at', 'desc');

  // Count query — add bene join only when search needs it
  const countQuery = trx('payments');
  if (search) countQuery.leftJoin('beneficiaries as b', 'payments.beneficiary_id', 'b.id');
  applyFilters(countQuery);
  const [{ count }] = await countQuery.count('payments.id as count');

  const offset = (page - 1) * limit;
  const data = await dataQuery.limit(limit).offset(offset);

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
