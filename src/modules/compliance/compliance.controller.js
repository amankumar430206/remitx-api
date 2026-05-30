import * as svc from './compliance.service.js';
import { clearPaymentSchema, blockPaymentSchema } from './compliance.validators.js';

export const initiateKyc = async (req, res) => {
  const data = await svc.initiateKyc(req.user.sub, req.user.tenantId, req);
  res.status(201).json({ success: true, data });
};

export const getKycStatus = async (req, res) => {
  const data = await svc.getKycStatus(req.user.sub, req.user.tenantId);
  res.json({ success: true, data });
};

export const uploadDocument = async (req, res) => {
  const data = await svc.uploadKycDocument(req.user.sub, req.user.tenantId, req.file, req.body.type || null, req);
  res.json({ success: true, data });
};

export const listQueue = async (req, res) => {
  const data = await svc.listComplianceQueue(req.user.tenantId);
  res.json({ success: true, data });
};

export const clearPayment = async (req, res) => {
  const { error, value } = clearPaymentSchema.validate(req.body);
  if (error) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: error.message } });

  const data = await svc.clearPayment(req.params.id, req.user.tenantId, req.user.sub, value.notes, req);
  res.json({ success: true, data });
};

export const serveDocument = async (req, res) => {
  const { filePath, filename, mimetype } = await svc.getKycDocumentFile(
    req.user.sub, req.user.tenantId, req.params.storedAs,
  );
  const inline = req.query.inline !== 'false';
  res.setHeader('Content-Type', mimetype);
  res.setHeader('Content-Disposition', inline ? 'inline' : `attachment; filename="${filename}"`);
  res.sendFile(filePath);
};

export const blockPayment = async (req, res) => {
  const { error, value } = blockPaymentSchema.validate(req.body);
  if (error) return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: error.message } });

  const data = await svc.blockPayment(req.params.id, req.user.tenantId, req.user.sub, value.reason, req);
  res.json({ success: true, data });
};
