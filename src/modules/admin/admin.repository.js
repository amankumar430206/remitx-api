import db from '../../config/database.js';

// ─── Tenants ──────────────────────────────────────────────────────────────────

export const listTenants = async (trx = db) =>
  trx('tenants as t')
    .select(
      't.*',
      trx.raw(`(
        SELECT COUNT(*)::int FROM users u
        WHERE u.tenant_id = t.id
      ) AS user_count`),
      trx.raw(`(
        SELECT COUNT(*)::int FROM users u
        WHERE u.tenant_id = t.id
        AND u.kyc_status = 'submitted'
      ) AS pending_kyc_count`)
    )
    .orderBy('t.created_at', 'desc');

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
    .select('id', 'email', 'first_name', 'last_name', 'phone', 'role', 'status', 'kyc_status', 'created_at')
    .orderBy('created_at', 'desc');

export const getTenantContact = async (tenantId, trx = db) =>
  trx('users as u')
    .leftJoin('kyc_applications as k', function () {
      this.on('k.user_id', '=', 'u.id').andOn('k.tenant_id', '=', 'u.tenant_id');
    })
    .where({ 'u.tenant_id': tenantId, 'u.role': 'client_admin' })
    .select(
      'u.id', 'u.email', 'u.first_name', 'u.last_name', 'u.phone',
      'u.role', 'u.status', 'u.kyc_status', 'u.created_at',
      'k.id as kyc_id', 'k.status as kyc_app_status',
      'k.documents as kyc_documents', 'k.reviewed_at', 'k.rejection_reason',
    )
    .first();

// ─── Tenant beneficiaries + accounts (for on-behalf flow) ────────────────────

export const listTenantBeneficiaries = async (tenantId, trx = db) =>
  trx('beneficiaries')
    .where({ tenant_id: tenantId, is_active: true })
    .orderBy('name', 'asc');

export const listTenantAccounts = async (tenantId, trx = db) =>
  trx('accounts as a')
    .where({ 'a.tenant_id': tenantId, 'a.status': 'active' })
    .select(
      'a.*',
      trx.raw(`COALESCE(
        (SELECT running_balance FROM ledger_entries WHERE account_id = a.id ORDER BY created_at DESC LIMIT 1),
        0
      ) AS balance`),
    )
    .orderBy('a.currency', 'asc');

// ─── Tenant default provider ──────────────────────────────────────────────────

export const getTenantDefaultProvider = async (tenantId, trx = db) => {
  const row = await trx('tenants').where({ id: tenantId }).select('default_provider_name').first();
  return row?.default_provider_name ?? null;
};

export const setTenantDefaultProvider = async (tenantId, providerName, trx = db) => {
  const [row] = await trx('tenants')
    .where({ id: tenantId })
    .update({ default_provider_name: providerName || null, updated_at: new Date() })
    .returning('id', 'default_provider_name');
  return row;
};

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

export const deleteCorridorById = async (corridorId, tenantId, trx = db) =>
  trx('provider_corridor_configs').where({ id: corridorId, tenant_id: tenantId }).delete();

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

// ─── Global (platform) corridor configs ──────────────────────────────────────
// Uses the RemitX platform tenant (slug='remitx') as the global fallback store.

export const getPlatformTenantId = async (trx = db) => {
  const t = await trx('tenants').where({ slug: 'remitx' }).select('id').first();
  return t?.id ?? null;
};

export const getGlobalCorridorConfigs = async (trx = db) =>
  trx('provider_corridor_configs as p')
    .join('tenants as t', 't.id', '=', 'p.tenant_id')
    .where({ 't.slug': 'remitx' })
    .select('p.*')
    .orderBy('p.priority', 'asc');

export const resolveGlobalProviderForCorridor = async (sourceCurrency, destCurrency, trx = db) => {
  const exact = await trx('provider_corridor_configs as p')
    .join('tenants as t', 't.id', '=', 'p.tenant_id')
    .where({ 't.slug': 'remitx', 'p.source_currency': sourceCurrency, 'p.dest_currency': destCurrency, 'p.is_active': true })
    .orderBy('p.priority', 'asc')
    .select('p.provider_name')
    .first();
  if (exact) return exact.provider_name;

  const wildcard = await trx('provider_corridor_configs as p')
    .join('tenants as t', 't.id', '=', 'p.tenant_id')
    .where({ 't.slug': 'remitx', 'p.source_currency': sourceCurrency, 'p.is_active': true })
    .whereNull('p.dest_currency')
    .orderBy('p.priority', 'asc')
    .select('p.provider_name')
    .first();
  return wildcard?.provider_name ?? null;
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

export const listAllPayments = async ({ page, limit, tenantId, status, providerName, from, to }, trx = db) => {
  const applyFilters = (q) => {
    if (tenantId)     q.where({ 'p.tenant_id': tenantId });
    if (status)       q.andWhere({ 'p.status': status });
    if (providerName) q.andWhere({ 'p.provider_name': providerName });
    if (from)         q.andWhere('p.created_at', '>=', new Date(from));
    if (to) {
      const toEnd = new Date(to);
      toEnd.setHours(23, 59, 59, 999);
      q.andWhere('p.created_at', '<=', toEnd);
    }
  };

  // Separate count query — avoids mixing aggregates with SELECT p.* which fails in PostgreSQL
  const countQuery = trx('payments as p');
  applyFilters(countQuery);
  const [{ count }] = await countQuery.count('* as count');

  const dataQuery = trx('payments as p')
    .leftJoin('tenants as t', 't.id', '=', 'p.tenant_id')
    .leftJoin('beneficiaries as b', 'p.beneficiary_id', 'b.id')
    .select(
      'p.*',
      't.name as tenant_name',
      't.slug as tenant_slug',
      'b.name as beneficiary_name',
      'b.country_code as beneficiary_country_code',
    );
  applyFilters(dataQuery);
  dataQuery.orderBy('p.created_at', 'desc').limit(limit).offset((page - 1) * limit);

  const data = await dataQuery;
  return { data, total: parseInt(count, 10) };
};

export const listApprovalQueueAll = async (tenantId, trx = db) => {
  const q = trx('payments as p')
    .leftJoin('beneficiaries as b', 'p.beneficiary_id', 'b.id')
    .leftJoin('tenants as t', 't.id', '=', 'p.tenant_id')
    .select(
      'p.*',
      'b.name as beneficiary_name',
      'b.country_code as beneficiary_country_code',
      't.name as tenant_name',
      't.slug as tenant_slug',
    )
    .whereIn('p.status', ['pending_approval', 'pending_compliance'])
    .orderBy('p.created_at', 'asc');
  if (tenantId) q.where({ 'p.tenant_id': tenantId });
  return q;
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
