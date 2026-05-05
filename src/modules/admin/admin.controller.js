import { listKycQueue, approveKyc, rejectKyc } from '../compliance/index.js';
import { rejectKycSchema } from '../compliance/compliance.validators.js';

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
