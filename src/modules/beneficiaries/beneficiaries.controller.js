import * as service from './beneficiaries.service.js';
import { createBeneficiarySchema, updateBeneficiarySchema } from './beneficiaries.validators.js';
import { getSubtreeUserIds } from '../../shared/utils/subtree.js';

const ADMIN_ROLES = new Set(['super_admin', 'client_admin']);

export const create = async (req, res) => {
  const payload = await createBeneficiarySchema.validateAsync(req.body, { abortEarly: false });
  const bene = await service.createBeneficiary(payload, req.user.sub, req.tenantId);
  res.status(201).json({ success: true, data: bene, requestId: req.id });
};

export const list = async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));

  const userIds = ADMIN_ROLES.has(req.user.role)
    ? null
    : await getSubtreeUserIds(req.user.sub, req.user.tenantId);

  const result = await service.listBeneficiaries(req.tenantId, userIds, { page, limit });
  res.json({ success: true, data: result.data, meta: result.meta, requestId: req.id });
};

export const getOne = async (req, res) => {
  const bene = await service.getBeneficiary(req.params.id, req.tenantId, req.user.sub);
  res.json({ success: true, data: bene, requestId: req.id });
};

export const update = async (req, res) => {
  const payload = await updateBeneficiarySchema.validateAsync(req.body, { abortEarly: false });
  const bene = await service.updateBeneficiary(req.params.id, req.tenantId, req.user.sub, payload);
  res.json({ success: true, data: bene, requestId: req.id });
};

export const remove = async (req, res) => {
  const result = await service.deleteBeneficiary(req.params.id, req.tenantId, req.user.sub);
  res.json({ success: true, data: result, requestId: req.id });
};
