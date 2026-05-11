import db from '../../config/database.js';

// ─── Tenants ──────────────────────────────────────────────────────────────────

export const listTenants = async (trx = db) =>
  trx('tenants').select('*').orderBy('created_at', 'desc');

export const findTenantById = async (id, trx = db) =>
  trx('tenants').where({ id }).first();

export const createTenant = async (data, trx = db) => {
  const [row] = await trx('tenants').insert(data).returning('*');
  return row;
};

export const updateTenant = async (id, data, trx = db) => {
  const [row] = await trx('tenants')
    .where({ id })
    .update({ ...data, updated_at: new Date() })
    .returning('*');
  return row;
};

export const listTenantUsers = async (tenantId, trx = db) =>
  trx('users')
    .where({ tenant_id: tenantId })
    .select('id', 'email', 'first_name', 'last_name', 'role', 'status', 'kyc_status', 'created_at')
    .orderBy('created_at', 'desc');

// ─── Provider corridor configs ────────────────────────────────────────────────

export const getCorridorConfigs = async (tenantId, trx = db) =>
  trx('provider_corridor_configs')
    .where({ tenant_id: tenantId })
    .orderBy('priority', 'asc');

export const upsertCorridorConfig = async (tenantId, { sourceCurrency, destCurrency, providerName, priority }, trx = db) => {
  const data = {
    tenant_id: tenantId,
    source_currency: sourceCurrency.toUpperCase(),
    dest_currency: destCurrency ? destCurrency.toUpperCase() : null,
    provider_name: providerName,
    priority: priority ?? 1,
    is_active: true,
  };
  const [row] = await trx('provider_corridor_configs')
    .insert(data)
    .onConflict(['tenant_id', 'source_currency', 'dest_currency'])
    .merge()
    .returning('*');
  return row;
};

export const resolveProviderForCorridor = async (tenantId, sourceCurrency, destCurrency, trx = db) => {
  // Exact match first
  const exact = await trx('provider_corridor_configs')
    .where({ tenant_id: tenantId, source_currency: sourceCurrency, dest_currency: destCurrency, is_active: true })
    .orderBy('priority', 'asc')
    .first();
  if (exact) return exact.provider_name;

  // Wildcard (dest_currency IS NULL)
  const wildcard = await trx('provider_corridor_configs')
    .where({ tenant_id: tenantId, source_currency: sourceCurrency, is_active: true })
    .whereNull('dest_currency')
    .orderBy('priority', 'asc')
    .first();
  if (wildcard) return wildcard.provider_name;

  return null;
};

// ─── Fee configs ─────────────────────────────────────────────────────────────

export const listFeeConfigs = async (tenantId, trx = db) =>
  trx('fee_configs')
    .where({ tenant_id: tenantId })
    .orderBy([
      { column: 'source_currency', order: 'asc' },
      { column: 'dest_currency',   order: 'asc' },
    ]);

export const findFeeConfig = async (id, tenantId, trx = db) =>
  trx('fee_configs').where({ id, tenant_id: tenantId }).first();

export const createFeeConfig = async (data, trx = db) => {
  const [row] = await trx('fee_configs').insert(data).returning('*');
  return row;
};

export const updateFeeConfig = async (id, tenantId, data, trx = db) => {
  const [row] = await trx('fee_configs')
    .where({ id, tenant_id: tenantId })
    .update({ ...data, updated_at: new Date() })
    .returning('*');
  return row;
};

export const deleteFeeConfig = async (id, tenantId, trx = db) =>
  trx('fee_configs').where({ id, tenant_id: tenantId }).delete();

export const resolveFeeConfig = async (tenantId, sourceCurrency, destCurrency, trx = db) => {
  // 1. Exact corridor match
  const exact = await trx('fee_configs')
    .where({ tenant_id: tenantId, source_currency: sourceCurrency, dest_currency: destCurrency, is_active: true })
    .first();
  if (exact) return exact;

  // 2. Wildcard (source only, null dest)
  const wildcard = await trx('fee_configs')
    .where({ tenant_id: tenantId, source_currency: sourceCurrency, is_active: true })
    .whereNull('dest_currency')
    .first();
  return wildcard ?? null;
};

// ─── Manual payment queue ─────────────────────────────────────────────────────

export const listManualQueue = async (trx = db) =>
  trx('payments')
    .where({ status: 'pending_manual_processing' })
    .orderBy('created_at', 'asc');

export const getPaymentById = async (id, trx = db) =>
  trx('payments').where({ id }).first();

export const processManualPayment = async (id, tenantId, data, trx = db) => {
  const [row] = await trx('payments')
    .where({ id, tenant_id: tenantId })
    .update({ ...data, updated_at: new Date() })
    .returning('*');
  return row;
};

// ─── Cross-tenant views ───────────────────────────────────────────────────────

export const listAllPayments = async ({ page, limit, tenantId, status }, trx = db) => {
  const q = trx('payments');
  if (tenantId) q.where({ tenant_id: tenantId });
  if (status)   q.andWhere({ status });
  q.orderBy('created_at', 'desc');

  const [{ count }] = await q.clone().clearOrder().count('* as count');
  const data = await q.limit(limit).offset((page - 1) * limit);
  return { data, total: parseInt(count, 10) };
};

export const listAllReconciliationExceptions = async (trx = db) =>
  trx('reconciliation_reports')
    .where({ status: 'exceptions' })
    .orderBy('report_date', 'desc')
    .limit(200);

// ─── Approval rules seeding ───────────────────────────────────────────────────

export const seedApprovalRules = async (tenantId, trx = db) => {
  const rules = [
    { tenant_id: tenantId, name: 'Auto-approve small', min_amount: 0, max_amount: 999.99, auto_approve: true,  required_approvals: 0, priority: 1 },
    { tenant_id: tenantId, name: 'Single approval',   min_amount: 1000, max_amount: 49999.99, auto_approve: false, required_approvals: 1, priority: 2 },
    { tenant_id: tenantId, name: 'Dual approval',     min_amount: 50000, max_amount: null, auto_approve: false, required_approvals: 2, priority: 3 },
  ];
  await trx('approval_rules').insert(rules);
};

export const createThemeConfig = async (tenantId, trx = db) => {
  await trx('tenant_theme_configs')
    .insert({
      tenant_id: tenantId,
      primary_color: '#1a56db',
      secondary_color: '#7e3af2',
      company_name: 'RemitX',
      font_family: 'Inter',
    })
    .onConflict('tenant_id')
    .ignore();
};
