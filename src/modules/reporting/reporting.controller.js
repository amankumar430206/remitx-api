import * as svc from './reporting.service.js';

export const getStatement = async (req, res) => {
  const { accountId, from, to, format = 'json' } = req.query;
  const result = await svc.getStatement(
    { tenantId: req.user.tenantId, accountId, from, to, format },
    res,
  );
  if (result) res.json({ success: true, data: result });
};

export const getTransactions = async (req, res) => {
  const { from, to, status, direction, currency, format = 'json' } = req.query;
  const page  = parseInt(req.query.page  || '1',  10);
  const limit = parseInt(req.query.limit || '20', 10);
  const result = await svc.getTransactions(
    { tenantId: req.user.tenantId, userId: req.user.sub, from, to, status, direction, currency, page, limit, format },
    res,
  );
  if (result) res.json({ success: true, ...result });
};

export const getFxSummary = async (req, res) => {
  const { from, to } = req.query;
  const data = await svc.getFxSummary({ tenantId: req.user.tenantId, from, to });
  res.json({ success: true, data });
};

export const listReconciliation = async (req, res) => {
  const data = await svc.listReconciliationReports(req.user.tenantId);
  res.json({ success: true, data });
};

export const getReconciliationByDate = async (req, res) => {
  const data = await svc.getReconciliationReport(req.user.tenantId, req.params.date);
  res.json({ success: true, data });
};

export const getAuditLogs = async (req, res) => {
  const { from, to, action, resourceType } = req.query;
  const page  = parseInt(req.query.page  || '1',  10);
  const limit = parseInt(req.query.limit || '50', 10);
  const result = await svc.getAuditLogs(
    { tenantId: req.user.tenantId, from, to, action, resourceType, page, limit },
  );
  res.json({ success: true, ...result });
};
