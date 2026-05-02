import * as service from './accounts.service.js';
import * as validators from './accounts.validators.js';

export const provision = async (req, res) => {
  const payload = await validators.provisionAccountSchema.validateAsync(req.body, { abortEarly: false });
  const account = await service.provisionAccount({
    currency: payload.currency,
    userId: req.user.sub,
    tenantId: req.tenantId,
  });
  res.status(201).json({ success: true, data: account, requestId: req.id });
};

export const list = async (req, res) => {
  const accounts = await service.listAccounts(req.tenantId, req.user.sub);
  res.json({ success: true, data: accounts, requestId: req.id });
};

export const getOne = async (req, res) => {
  const account = await service.getAccount(req.params.id, req.tenantId, req.user.sub);
  res.json({ success: true, data: account, requestId: req.id });
};

export const getLedger = async (req, res) => {
  const query = await validators.ledgerQuerySchema.validateAsync(req.query, { abortEarly: false });
  const result = await service.getLedger(req.params.id, req.tenantId, req.user.sub, query);
  res.json({ success: true, data: result.data, meta: result.meta, requestId: req.id });
};
