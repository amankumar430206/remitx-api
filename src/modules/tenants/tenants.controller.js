import * as service from './tenants.service.js';

export const getConfig = async (req, res) => {
  const config = await service.getTenantConfig(req.tenantId);
  res.json({ success: true, data: config, requestId: req.id });
};

export const getTheme = async (req, res) => {
  const theme = await service.getTenantTheme(req.tenantId);
  res.json({ success: true, data: theme, requestId: req.id });
};
