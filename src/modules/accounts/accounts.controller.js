import * as service from './accounts.service.js';
import * as validators from './accounts.validators.js';
import { getSubtreeUserIds } from '../../shared/utils/subtree.js';
import { resolveFeeByCategory } from '../admin/index.js';

const ADMIN_ROLES = new Set(['super_admin', 'client_admin']);

export const provision = async (req, res) => {
  const payload = await validators.provisionAccountSchema.validateAsync(req.body, { abortEarly: false });
  const account = await service.provisionAccount({
    currency: payload.currency,
    label:    payload.label || null,
    userId: req.user.sub,
    tenantId: req.tenantId,
  });
  res.status(201).json({ success: true, data: account, requestId: req.id });
};

export const list = async (req, res) => {
  const userIds = ADMIN_ROLES.has(req.user.role)
    ? null
    : await getSubtreeUserIds(req.user.sub, req.user.tenantId);

  const accounts = await service.listAccounts(req.tenantId, userIds);
  res.json({ success: true, data: accounts, requestId: req.id });
};

export const getOne = async (req, res) => {
  const account = await service.getAccount(req.params.id, req.tenantId, req.user.sub, req.user.role);
  res.json({ success: true, data: account, requestId: req.id });
};

export const adjust = async (req, res) => {
  const payload = await validators.adjustBalanceSchema.validateAsync(req.body, { abortEarly: false });
  const result = await service.adjustBalance({
    accountId: req.params.id,
    tenantId: req.tenantId,
    ...payload,
  });
  res.json({ success: true, data: result, requestId: req.id });
};

export const getLedger = async (req, res) => {
  const query = await validators.ledgerQuerySchema.validateAsync(req.query, { abortEarly: false });
  const result = await service.getLedger(req.params.id, req.tenantId, req.user.sub, query, req.user.role);
  res.json({ success: true, data: result.data, meta: result.meta, requestId: req.id });
};

export const feePreview = async (req, res) => {
  const activation = await resolveFeeByCategory(req.tenantId, 'account_activation');
  const ibanCreation = await resolveFeeByCategory(req.tenantId, 'iban_creation');
  res.json({
    success: true,
    data: {
      account_activation: { ...activation },
      iban_creation:      { ...ibanCreation },
    },
    requestId: req.id,
  });
};
