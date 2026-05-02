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
