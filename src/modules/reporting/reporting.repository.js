import db from '../../config/database.js';

// ─── Statement (ledger entries for an account) ────────────────────────────────

export const getLedgerEntries = async ({ tenantId, accountId, from, to }, trx = db) => {
  const q = trx('ledger_entries as le')
    .join('accounts as a', 'a.id', 'le.account_id')
    .where('le.tenant_id', tenantId)
    .orderBy('le.created_at', 'asc')
    .select('le.*', 'a.currency', 'a.account_number');

  if (accountId) q.andWhere('le.account_id', accountId);
  if (from)      q.andWhere('le.created_at', '>=', new Date(from));
  if (to)        q.andWhere('le.created_at', '<=', new Date(to));
  return q;
};

export const getOpeningBalance = async ({ tenantId, accountId, from }, trx = db) => {
  const q = trx('ledger_entries')
    .where({ tenant_id: tenantId })
    .where('created_at', '<', new Date(from));
  if (accountId) q.andWhere('account_id', accountId);

  const credits = await q.clone().where({ entry_type: 'credit' }).sum('amount as total').first();
  const debits  = await q.clone().where({ entry_type: 'debit'  }).sum('amount as total').first();
  const { default: Big } = await import('big.js');
  return new Big(credits?.total || 0).minus(new Big(debits?.total || 0)).toFixed(8);
};

// ─── Transactions ─────────────────────────────────────────────────────────────

export const getTransactions = async ({ tenantId, userId, from, to, status, currency, page, limit }, trx = db) => {
  const q = trx('payments').where({ tenant_id: tenantId });
  if (userId)   q.andWhere({ user_id: userId });
  if (status)   q.andWhere({ status });
  if (currency) q.andWhere('source_currency', currency);
  if (from)     q.andWhere('created_at', '>=', new Date(from));
  if (to)       q.andWhere('created_at', '<=', new Date(to));
  q.orderBy('created_at', 'desc');

  const [{ count }] = await q.clone().clearOrder().count('* as count');
  const data = await q.limit(limit).offset((page - 1) * limit);
  return { data, total: parseInt(count, 10) };
};

// ─── FX Summary ───────────────────────────────────────────────────────────────

export const getFxSummary = async ({ tenantId, from, to }, trx = db) => {
  const q = trx('payments')
    .where({ tenant_id: tenantId })
    .whereIn('status', ['completed', 'processing', 'pending_manual_processing']);
  if (from) q.andWhere('created_at', '>=', new Date(from));
  if (to)   q.andWhere('created_at', '<=', new Date(to));

  const rows = await q.select(
    'source_currency',
    'dest_currency',
    trx.raw('COUNT(*) as count'),
    trx.raw('SUM(source_amount) as total_source'),
    trx.raw('SUM(dest_amount) as total_dest'),
    trx.raw('AVG(exchange_rate) as avg_rate'),
  ).groupBy('source_currency', 'dest_currency');

  return rows;
};

// ─── Reconciliation ───────────────────────────────────────────────────────────

export const listReconciliationReports = async (tenantId, trx = db) =>
  trx('reconciliation_reports')
    .where({ tenant_id: tenantId })
    .orderBy('report_date', 'desc')
    .limit(90);

export const getReconciliationReport = async (tenantId, date, trx = db) =>
  trx('reconciliation_reports').where({ tenant_id: tenantId, report_date: date }).first();

export const upsertReconciliationReport = async (data, trx = db) => {
  const [row] = await trx('reconciliation_reports')
    .insert(data)
    .onConflict(['tenant_id', 'report_date'])
    .merge()
    .returning('*');
  return row;
};

export const getCompletedPaymentsForDate = async (tenantId, date, trx = db) => {
  const start = new Date(date);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setUTCHours(23, 59, 59, 999);

  return trx('payments')
    .where({ tenant_id: tenantId, status: 'completed' })
    .whereBetween('completed_at', [start, end]);
};

// ─── Audit ────────────────────────────────────────────────────────────────────

export const getAuditLogs = async ({ tenantId, from, to, action, resourceType, page, limit }, trx = db) => {
  const q = trx('audit_logs').where({ tenant_id: tenantId });
  if (action)       q.andWhere({ action });
  if (resourceType) q.andWhere({ resource_type: resourceType });
  if (from)         q.andWhere('created_at', '>=', new Date(from));
  if (to)           q.andWhere('created_at', '<=', new Date(to));
  q.orderBy('created_at', 'desc');

  const [{ count }] = await q.clone().clearOrder().count('* as count');
  const data = await q.limit(limit).offset((page - 1) * limit);
  return { data, total: parseInt(count, 10) };
};
