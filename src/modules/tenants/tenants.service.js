import { randomBytes } from 'crypto';
import { AppError } from '../../shared/errors/AppError.js';
import * as repo from './tenants.repository.js';

const DEFAULT_THEME = {
  primary_color: '#1a56db',
  secondary_color: '#7e3af2',
  logo_url: null,
  favicon_url: null,
  company_name: 'RemitX',
  custom_domain: null,
  font_family: 'Inter',
  webhook_url: null,
  webhook_secret: null,
  webhook_enabled: false,
};

export const getTenantConfig = async (tenantId) => {
  const tenant = await repo.findTenantById(tenantId);
  if (!tenant) return null;
  const { id, slug, name, status } = tenant;
  return { id, slug, name, status };
};

export const getTenantTheme = async (tenantId) => {
  const config = await repo.findThemeConfig(tenantId);
  if (!config) return { ...DEFAULT_THEME, tenant_id: tenantId };
  const { webhook_secret, ...safeConfig } = config;
  return safeConfig;
};

export const getWebhookConfig = async (tenantId) => {
  const config = await repo.findThemeConfig(tenantId);
  return {
    webhook_url: config?.webhook_url || null,
    webhook_enabled: config?.webhook_enabled || false,
    has_secret: !!(config?.webhook_secret),
  };
};

export const updateWebhookConfig = async (tenantId, { webhookUrl, webhookSecret, webhookEnabled }) => {
  if (webhookUrl !== undefined) {
    try { new URL(webhookUrl); } catch {
      throw new AppError('VALIDATION_ERROR', 'webhook_url must be a valid URL', 400);
    }
  }

  const data = {};
  if (webhookUrl !== undefined) data.webhook_url = webhookUrl;
  if (webhookEnabled !== undefined) data.webhook_enabled = webhookEnabled;
  if (webhookSecret !== undefined) {
    data.webhook_secret = webhookSecret || randomBytes(32).toString('hex');
  }

  const row = await repo.upsertWebhookConfig(tenantId, data);
  return {
    webhook_url: row.webhook_url,
    webhook_enabled: row.webhook_enabled,
    has_secret: !!(row.webhook_secret),
  };
};
