import { AppError } from '../../shared/errors/AppError.js';
import { createScheduledPaymentSchema, updateScheduledPaymentSchema } from './scheduledPayments.validators.js';
import * as svc from './scheduledPayments.service.js';

export const create = async (req, res) => {
  const { error, value } = createScheduledPaymentSchema.validate(req.body, { abortEarly: false });
  if (error) throw new AppError('VALIDATION_ERROR', error.message, 422, error.details);

  const result = await svc.createScheduledPayment(value, req.user.sub, req.user.tenantId);
  res.status(201).json({ success: true, data: result });
};

export const list = async (req, res) => {
  const { page, limit, status } = req.query;

  // Non-admin users only see their own scheduled payments
  const isAdmin = (req.user.permissions || []).some(p => ['*:*', 'payments:view_all'].includes(p));
  const userId  = isAdmin ? undefined : req.user.sub;

  const result = await svc.listScheduledPayments(req.user.tenantId, userId, {
    page:   parseInt(page, 10) || 1,
    limit:  parseInt(limit, 10) || 20,
    status: status || undefined,
  });

  res.json({ success: true, ...result });
};

export const getOne = async (req, res) => {
  const result = await svc.getScheduledPayment(req.params.id, req.user.tenantId);
  res.json({ success: true, data: result });
};

export const update = async (req, res) => {
  const { error, value } = updateScheduledPaymentSchema.validate(req.body, { abortEarly: false });
  if (error) throw new AppError('VALIDATION_ERROR', error.message, 422, error.details);

  const result = await svc.updateScheduledPayment(req.params.id, req.user.tenantId, req.user.sub, value);
  res.json({ success: true, data: result });
};

export const cancel = async (req, res) => {
  const result = await svc.cancelScheduledPayment(req.params.id, req.user.tenantId, req.user.sub);
  res.json({ success: true, data: result });
};

export const skip = async (req, res) => {
  const result = await svc.skipScheduledPayment(req.params.id, req.user.tenantId, req.user.sub);
  res.json({ success: true, data: result });
};

export const executeNow = async (req, res) => {
  const result = await svc.executeScheduledPaymentNow(req.params.id, req.user.tenantId, req.user.sub);
  res.json({ success: true, data: result });
};
