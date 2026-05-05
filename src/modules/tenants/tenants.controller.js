import Joi from 'joi';
import * as service from './tenants.service.js';

const webhookConfigSchema = Joi.object({
  webhookUrl: Joi.string().uri().optional().allow(null, ''),
  webhookSecret: Joi.string().max(256).optional().allow(null, ''),
  webhookEnabled: Joi.boolean().optional(),
});

const inviteUserSchema = Joi.object({
  email: Joi.string().email().required(),
  role: Joi.string().required(),
  firstName: Joi.string().max(128).optional().allow('', null),
  lastName: Joi.string().max(128).optional().allow('', null),
});

const subClientSchema = Joi.object({
  email: Joi.string().email().required(),
  role: Joi.string().valid('subclient_admin', 'subclient_user').required(),
  firstName: Joi.string().max(128).optional().allow('', null),
  lastName: Joi.string().max(128).optional().allow('', null),
});

const roleSchema = Joi.object({
  role: Joi.string().max(64).required(),
  permissions: Joi.array().items(Joi.string()).required(),
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

export const updateTheme = async (req, res) => {
  const data = await service.updateTheme(req.user.tenantId, req.body);
  res.json({ success: true, data });
};

// ─── Users ────────────────────────────────────────────────────────────────────

export const inviteUser = async (req, res) => {
  const { error, value } = inviteUserSchema.validate(req.body);
  if (error) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: error.message } });
  const result = await service.inviteUser(req.user.tenantId, value);
  res.status(201).json({ success: true, data: result });
};

export const listUsers = async (req, res) => {
  const data = await service.listUsers(req.user.tenantId);
  res.json({ success: true, data });
};

export const getUserById = async (req, res) => {
  const data = await service.getUserById(req.params.id, req.user.tenantId);
  res.json({ success: true, data });
};

export const updateUserStatus = async (req, res) => {
  const { status } = req.body;
  const data = await service.updateUserStatus(req.params.id, req.user.tenantId, status);
  res.json({ success: true, data });
};

export const updateUserPermissions = async (req, res) => {
  const data = await service.updateUserPermissions(req.user.tenantId, req.params.id, req.body);
  res.json({ success: true, data });
};

// ─── Sub-clients ──────────────────────────────────────────────────────────────

export const createSubClient = async (req, res) => {
  const { error, value } = subClientSchema.validate(req.body);
  if (error) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: error.message } });
  const result = await service.createSubClient(req.user.tenantId, req.user.sub, value);
  res.status(201).json({ success: true, data: result });
};

export const listSubClients = async (req, res) => {
  const data = await service.listSubClients(req.user.tenantId, req.user.sub, req.user.role);
  res.json({ success: true, data });
};

export const getSubClientById = async (req, res) => {
  const data = await service.getSubClientById(req.params.id, req.user.tenantId);
  res.json({ success: true, data });
};

// ─── Roles ────────────────────────────────────────────────────────────────────

export const listRoles = async (req, res) => {
  const data = await service.listRoles(req.user.tenantId);
  res.json({ success: true, data });
};

export const upsertRole = async (req, res) => {
  const { error, value } = roleSchema.validate(req.body);
  if (error) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: error.message } });
  const data = await service.upsertRole(req.user.tenantId, value);
  res.status(201).json({ success: true, data });
};
