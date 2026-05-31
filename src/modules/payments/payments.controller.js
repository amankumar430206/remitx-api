import * as service from './payments.service.js';
import { submitPaymentSchema, rejectPaymentSchema } from './payments.validators.js';
import { getSubtreeUserIds } from '../../shared/utils/subtree.js';
import { previewFee, listAllPayments, listApprovalQueueAll } from '../admin/index.js';

const ADMIN_ROLES = new Set(['super_admin', 'client_admin']);

export const submit = async (req, res) => {
  const payload = await submitPaymentSchema.validateAsync(req.body, { abortEarly: false });
  const idempotencyKey = req.headers['idempotency-key'];
  const payment = await service.submitPayment(payload, req.user.sub, req.tenantId, idempotencyKey, req);
  res.status(201).json({ success: true, data: payment, requestId: req.id });
};

export const list = async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '20', 10)));
  const { status, direction, search, from, to } = req.query;

  // Super admin sees all tenants cross-tenant (optional tenantId filter)
  if (req.user.role === 'super_admin') {
    const { tenantId, providerName } = req.query;
    const result = await listAllPayments({
      page, limit,
      tenantId:     tenantId     || undefined,
      status:       status       || undefined,
      providerName: providerName || undefined,
      from:         from         || undefined,
      to:           to           || undefined,
    });
    return res.json({ success: true, data: result.data, meta: result.meta, requestId: req.id });
  }

  // Admin roles see the full tenant; others see only their subtree
  const userIds = ADMIN_ROLES.has(req.user.role)
    ? null
    : await getSubtreeUserIds(req.user.sub, req.user.tenantId);

  const result = await service.listPayments(req.tenantId, userIds, {
    page, limit,
    status: status || undefined,
    direction: direction || undefined,
    search: search || undefined,
    from: from || undefined,
    to: to || undefined,
  });
  res.json({ success: true, data: result.data, meta: result.meta, requestId: req.id });
};

export const getApprovalQueue = async (req, res) => {
  if (req.user.role === 'super_admin') {
    const { tenantId } = req.query;
    const data = await listApprovalQueueAll(tenantId || null);
    return res.json({ success: true, data, requestId: req.id });
  }
  const data = await service.listApprovalQueue(req.tenantId);
  res.json({ success: true, data, requestId: req.id });
};

export const getOne = async (req, res) => {
  const tenantId = req.user.role === 'super_admin' ? null : req.tenantId;
  const payment = await service.getPayment(req.params.id, tenantId);
  res.json({ success: true, data: payment, requestId: req.id });
};

export const getFeePreview = async (req, res) => {
  const { from, to, amount } = req.query;
  if (!from || !to || !amount) {
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'from, to, and amount are required' } });
  }
  const numAmount = parseFloat(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'amount must be a positive number' } });
  }
  const data = await previewFee(req.tenantId, String(from).toUpperCase(), String(to).toUpperCase(), String(amount));
  res.json({ success: true, data, requestId: req.id });
};

export const approve = async (req, res) => {
  const tenantId = req.user.role === 'super_admin' ? null : req.tenantId;
  const payment = await service.approvePayment(req.params.id, tenantId, req.user.sub, req.user.role, req);
  res.json({ success: true, data: payment, requestId: req.id });
};

export const reject = async (req, res) => {
  const { reason } = await rejectPaymentSchema.validateAsync(req.body, { abortEarly: false });
  const tenantId = req.user.role === 'super_admin' ? null : req.tenantId;
  const payment = await service.rejectPayment(req.params.id, tenantId, req.user.sub, reason, req);
  res.json({ success: true, data: payment, requestId: req.id });
};

export const cancel = async (req, res) => {
  const payment = await service.cancelPayment(req.params.id, req.tenantId, req.user.sub, req);
  res.json({ success: true, data: payment, requestId: req.id });
};
