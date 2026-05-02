import db from '../../config/database.js';

export const findTenantById = async (id, trx = db) =>
  trx('tenants').where({ id }).first();

export const findTenantBySlug = async (slug, trx = db) =>
  trx('tenants').where({ slug }).first();

export const findThemeConfig = async (tenantId, trx = db) =>
  trx('tenant_theme_configs').where({ tenant_id: tenantId }).first();
