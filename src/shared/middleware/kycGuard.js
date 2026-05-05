import db from '../../config/database.js';
import { AppError } from '../errors/AppError.js';

export const kycGuard = async (req, res, next) => {
  const user = await db('users')
    .where({ id: req.user.sub, tenant_id: req.user.tenantId })
    .first();

  if (!user || user.kyc_status !== 'approved') {
    throw new AppError('KYC_NOT_APPROVED', 'Complete identity verification before sending payments', 403);
  }

  if (user.kyc_expires_at && user.kyc_expires_at < new Date()) {
    await db('users').where({ id: req.user.sub }).update({ kyc_status: 'expired' });
    throw new AppError('KYC_EXPIRED', 'Identity verification expired, please re-verify', 403);
  }

  next();
};
