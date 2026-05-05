import db from '../../config/database.js';

export const findTenantById = async (id, trx = db) =>
  trx('tenants').where({ id }).first();

export const findTenantBySlug = async (slug, trx = db) =>
  trx('tenants').where({ slug }).first();

export const findThemeConfig = async (tenantId, trx = db) =>
  trx('tenant_theme_configs').where({ tenant_id: tenantId }).first();

export const upsertWebhookConfig = async (tenantId, data, trx = db) => {
  const existing = await trx('tenant_theme_configs').where({ tenant_id: tenantId }).first();
  if (existing) {
    const [row] = await trx('tenant_theme_configs')
      .where({ tenant_id: tenantId })
      .update({ ...data, updated_at: new Date() })
      .returning('*');
    return row;
  }
  const [row] = await trx('tenant_theme_configs')
    .insert({ tenant_id: tenantId, ...data })
    .returning('*');
  return row;
};
