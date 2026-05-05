import Joi from 'joi';
import * as service from './tenants.service.js';

const webhookConfigSchema = Joi.object({
  webhookUrl: Joi.string().uri().optional().allow(null, ''),
  webhookSecret: Joi.string().max(256).optional().allow(null, ''),
  webhookEnabled: Joi.boolean().optional(),
});

export const getConfig = async (req, res) => {
  const config = await service.getTenantConfig(req.tenantId);
  res.json({ success: true, data: config, requestId: req.id });
};

export const getTheme = async (req, res) => {
  const theme = await service.getTenantTheme(req.tenantId);
  res.json({ success: true, data: theme, requestId: req.id });
};

export const getWebhookConfig = async (req, res) => {
  const data = await service.getWebhookConfig(req.user.tenantId);
  res.json({ success: true, data });
};

export const updateWebhookConfig = async (req, res) => {
  const { error, value } = webhookConfigSchema.validate(req.body);
  if (error) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: error.message } });
  const data = await service.updateWebhookConfig(req.user.tenantId, value);
  res.json({ success: true, data });
};
