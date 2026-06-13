import db from '../../config/database.js';

export const createAccount = async (data, trx = db) => {
  const [row] = await (trx)('accounts').insert(data).returning('*');
  return row;
};

export const findAccountById = async (id, tenantId, trx = db) =>
  trx('accounts').where({ id, tenant_id: tenantId, status: 'active' }).first();

export const findAccountByCurrency = async (userId, tenantId, currency, trx = db) =>
  trx('accounts').where({ user_id: userId, tenant_id: tenantId, currency, status: 'active' }).first();

export const listAccounts = async (tenantId, userIds, trx = db) => {
  const q = trx('accounts').where({ tenant_id: tenantId, status: 'active' });
  if (userIds && userIds.length > 0) q.whereIn('user_id', userIds);
  return q.orderBy('created_at', 'asc');
};

export const getLastLedgerEntry = async (accountId, trx = db) =>
  trx('ledger_entries')
    .where({ account_id: accountId })
    .orderBy('created_at', 'desc')
    .first();

export const getLastLedgerEntryForUpdate = async (accountId, trx) =>
  trx('ledger_entries')
    .where({ account_id: accountId })
    .orderBy('created_at', 'desc')
    .forUpdate()
    .first();

export const insertLedgerEntry = async (data, trx = db) => {
  const [row] = await (trx)('ledger_entries').insert(data).returning('*');
  return row;
};

export const listLedgerEntries = async ({ accountId, tenantId, from, to, limit, offset }, trx = db) => {
  const query = trx('ledger_entries')
    .where({ account_id: accountId, tenant_id: tenantId })
    .modify((qb) => {
      if (from) qb.where('created_at', '>=', new Date(from));
      if (to) { const toEnd = new Date(to); toEnd.setHours(23, 59, 59, 999); qb.where('created_at', '<=', toEnd); }
    })
    .orderBy('created_at', 'desc');

  const [{ count }] = await query.clone().clearOrder().count('* as count');
  const data = await query.limit(limit).offset(offset);

  return { data, total: parseInt(count, 10) };
};

export const getRecentLedgerEntries = async (accountId, tenantId, limit = 20, trx = db) =>
  trx('ledger_entries')
    .where({ account_id: accountId, tenant_id: tenantId })
    .orderBy('created_at', 'desc')
    .limit(limit);
