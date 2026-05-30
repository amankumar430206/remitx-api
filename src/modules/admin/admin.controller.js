import Joi from 'joi';
import { listKycQueue, approveKyc, rejectKyc } from '../compliance/index.js';
import { rejectKycSchema } from '../compliance/compliance.validators.js';
import * as service from './admin.service.js';
import { submitPaymentOnBehalf } from '../payments/index.js';

const createTenantSchema = Joi.object({
  slug: Joi.string().pattern(/^[a-z0-9-]+$/).min(2).max(64).required(),
  name: Joi.string().max(256).required(),
  adminEmail: Joi.string().email().required(),
});

const updateTenantSchema = Joi.object({
  name: Joi.string().max(256).optional(),
});

const corridorSchema = Joi.array().items(Joi.object({
  sourceCurrency: Joi.string().length(3).uppercase().required(),
  destCurrency: Joi.string().length(3).uppercase().optional().allow(null),
  providerName: Joi.string().max(64).required(),
  priority: Joi.number().integer().min(1).optional(),
})).min(1).required();

const processPaymentSchema = Joi.object({
  action: Joi.string().valid('complete', 'fail').required(),
  notes: Joi.string().max(512).optional().allow('', null),
  providerRef: Joi.string().max(128).optional().allow('', null),
});

const feeConfigSchema = Joi.object({
  sourceCurrency: Joi.string().length(3).uppercase().required(),
  destCurrency:   Joi.string().length(3).uppercase().optional().allow(null),
  feeType:        Joi.string().valid('flat', 'percent').required(),
  feeValue:       Joi.number().positive().required(),
  minFee:         Joi.number().min(0).optional().allow(null),
  maxFee:         Joi.number().positive().optional().allow(null),
});

const feeConfigUpdateSchema = Joi.object({
  feeType:  Joi.string().valid('flat', 'percent').optional(),
  feeValue: Joi.number().positive().optional(),
  minFee:   Joi.number().min(0).optional().allow(null),
  maxFee:   Joi.number().positive().optional().allow(null),
  isActive: Joi.boolean().optional(),
}).min(1);

// ─── KYC (existing) ───────────────────────────────────────────────────────────

export const getKycQueue = async (req, res) => {
  const data = await listKycQueue(req.user.tenantId);
  res.json({ success: true, data });
};

export const approveUserKyc = async (req, res) => {
  const data = await approveKyc(req.params.userId, req.params.id, req.user.sub, req);
  res.json({ success: true, data });
};

export const rejectUserKyc = async (req, res) => {
  const { error, value } = rejectKycSchema.validate(req.body);
  if (error) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: error.message } });
  const data = await rejectKyc(req.params.userId, req.params.id, req.user.sub, value.reason, req);
  res.json({ success: true, data });
};

// ─── Tenants ──────────────────────────────────────────────────────────────────

export const listTenants = async (req, res) => {
  const data = await service.listTenants();
  res.json({ success: true, data });
};

export const createTenant = async (req, res) => {
  const { error, value } = createTenantSchema.validate(req.body);
  if (error) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: error.message } });
  const data = await service.createTenant(value, req.user.sub, req);
  res.status(201).json({ success: true, data });
};

export const getTenant = async (req, res) => {
  const data = await service.getTenant(req.params.id);
  res.json({ success: true, data });
};

export const updateTenant = async (req, res) => {
  const { error, value } = updateTenantSchema.validate(req.body);
  if (error) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: error.message } });
  const data = await service.updateTenant(req.params.id, value, req.user.sub, req);
  res.json({ success: true, data });
};

export const updateTenantStatus = async (req, res) => {
  const data = await service.updateTenantStatus(req.params.id, req.body.status, req.user.sub, req);
  res.json({ success: true, data });
};

export const getProviderConfig = async (req, res) => {
  const data = await service.getProviderConfig(req.params.id);
  res.json({ success: true, data });
};

export const updateProviderConfig = async (req, res) => {
  const { error, value } = corridorSchema.validate(req.body.corridors);
  if (error) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: error.message } });
  const data = await service.updateProviderConfig(req.params.id, value, req.user.sub, req);
  res.json({ success: true, data });
};

export const listTenantUsers = async (req, res) => {
  const data = await service.listTenantUsers(req.params.id);
  res.json({ success: true, data });
};

export const listTenantBeneficiaries = async (req, res) => {
  const data = await service.listTenantBeneficiaries(req.params.id);
  res.json({ success: true, data });
};

export const listTenantAccounts = async (req, res) => {
  const data = await service.listTenantAccounts(req.params.id);
  res.json({ success: true, data });
};

export const getTenantContact = async (req, res) => {
  const data = await service.getTenantContact(req.params.id);
  res.json({ success: true, data });
};

// ─── Fee config ───────────────────────────────────────────────────────────────

export const listFeeConfigs = async (req, res) => {
  const data = await service.listFeeConfigs(req.params.id);
  res.json({ success: true, data });
};

export const createFeeConfig = async (req, res) => {
  const { error, value } = feeConfigSchema.validate(req.body);
  if (error) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: error.message } });
  const data = await service.createFeeConfig(req.params.id, value, req.user.sub, req);
  res.status(201).json({ success: true, data });
};

export const updateFeeConfig = async (req, res) => {
  const { error, value } = feeConfigUpdateSchema.validate(req.body);
  if (error) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: error.message } });
  const data = await service.updateFeeConfig(req.params.id, req.params.feeId, value, req.user.sub, req);
  res.json({ success: true, data });
};

export const deleteFeeConfig = async (req, res) => {
  await service.deleteFeeConfig(req.params.id, req.params.feeId, req.user.sub, req);
  res.json({ success: true, data: null });
};

// ─── Manual payment queue ─────────────────────────────────────────────────────

export const getManualQueue = async (req, res) => {
  const data = await service.getManualQueue();
  res.json({ success: true, data });
};

export const processPayment = async (req, res) => {
  const { error, value } = processPaymentSchema.validate(req.body);
  if (error) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: error.message } });
  const data = await service.processPayment(req.params.id, value, req.user.sub, req);
  res.json({ success: true, data });
};

// ─── Cross-tenant views ───────────────────────────────────────────────────────

export const listAllPayments = async (req, res) => {
  const page  = Math.max(1, parseInt(req.query.page  || '1',  10));
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));
  const { tenantId, status } = req.query;
  const result = await service.listAllPayments({ page, limit, tenantId, status });
  res.json({ success: true, data: result.data, meta: result.meta });
};

export const listReconciliationExceptions = async (req, res) => {
  const data = await service.listReconciliationExceptions();
  res.json({ success: true, data });
};

// ─── Impersonation ────────────────────────────────────────────────────────────

export const impersonateUser = async (req, res) => {
  const data = await service.impersonateUser(req.params.userId, req.user.sub, req.user.tenantId, req);
  res.json({ success: true, data });
};

// ─── On-behalf payment ────────────────────────────────────────────────────────

const UUID = Joi.string().uuid({ version: 'uuidv4' });

const onBehalfPaymentSchema = Joi.object({
  targetUserId:  UUID.required(),
  beneficiaryId: UUID.required(),
  accountId:     UUID.required(),
  from:          Joi.string().length(3).uppercase().required(),
  to:            Joi.string().length(3).uppercase().required(),
  amount:        Joi.number().positive().required(),
  purposeCode:   Joi.string().valid('TRADE', 'SUPPLIER', 'SALARY', 'SERVICES', 'CONTRACTOR', 'OTHER').required(),
  note:          Joi.string().max(1024).optional().allow('', null),
});

export const createPaymentOnBehalf = async (req, res) => {
  const { error, value } = onBehalfPaymentSchema.validate(req.body);
  if (error) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: error.message } });
  const { targetUserId, ...payload } = value;
  const data = await submitPaymentOnBehalf(targetUserId, payload, req.user.sub, req);
  res.status(201).json({ success: true, data });
};

// ─── Per-client branding ──────────────────────────────────────────────────────

const brandingSchema = Joi.object({
  primaryColor:   Joi.string().pattern(/^#[0-9a-fA-F]{6}$/).optional(),
  secondaryColor: Joi.string().pattern(/^#[0-9a-fA-F]{6}$/).optional(),
  companyName:    Joi.string().max(256).optional().allow('', null),
  fontFamily:     Joi.string().max(64).optional(),
  logoUrl:        Joi.string().uri({ scheme: ['https', 'data'] }).optional().allow('', null),
}).min(1);

export const getGlobalTheme = async (req, res) => {
  const data = await service.getGlobalThemeForAdmin();
  res.json({ success: true, data, requestId: req.id });
};

export const getClientTheme = async (req, res) => {
  const data = await service.getClientTheme(req.params.id);
  res.json({ success: true, data, requestId: req.id });
};

export const updateClientTheme = async (req, res) => {
  const { error, value } = brandingSchema.validate(req.body);
  if (error) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: error.message } });
  const data = await service.updateClientTheme(req.params.id, value);
  res.json({ success: true, data, requestId: req.id });
};

export const resetClientTheme = async (req, res) => {
  const data = await service.resetClientTheme(req.params.id);
  res.json({ success: true, data, requestId: req.id });
};
