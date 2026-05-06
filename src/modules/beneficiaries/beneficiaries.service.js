import { complianceQueue } from '../../config/queues.js';
import { AppError } from '../../shared/errors/AppError.js';
import * as repo from './beneficiaries.repository.js';

const toDbRow = (payload, userId, tenantId) => ({
  tenant_id: tenantId,
  user_id: userId,
  name: payload.name,
  country_code: payload.countryCode?.toUpperCase(),
  currency: payload.currency?.toUpperCase(),
  bank_name: payload.bankName || null,
  bank_address: payload.bankAddress || null,
  account_number: payload.accountNumber || null,
  routing_number: payload.routingNumber || null,
  sort_code: payload.sortCode || null,
  ifsc_code: payload.ifscCode || null,
  iban: payload.iban || null,
  swift_bic: payload.swiftBic || null,
  purpose_code: payload.purposeCode,
  screening_status: 'pending',
  is_active: true,
});

const enqueueScreening = (beneficiaryId, tenantId) => {
  complianceQueue
    .add('beneficiary.screen', { beneficiaryId, tenantId }, {
      attempts: 2,
      backoff: { type: 'fixed', delay: 5000 },
    })
    .catch(() => {}); // fire-and-forget
};

const ADMIN_ROLES = new Set(['super_admin', 'client_admin']);

export const createBeneficiary = async (payload, userId, tenantId) => {
  const row = await repo.create(toDbRow(payload, userId, tenantId));
  enqueueScreening(row.id, tenantId);
  return row;
};

export const listBeneficiaries = async (tenantId, userIds, { page = 1, limit = 20 } = {}) => {
  const { data, total } = await repo.list({ tenantId, userIds, page, limit });
  return {
    data,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasMore: page * limit < total,
    },
  };
};

export const getBeneficiary = async (id, tenantId, userId, role = null) => {
  const bene = await repo.findById(id, tenantId);
  if (!bene) throw new AppError('NOT_FOUND', 'Beneficiary not found', 404);
  if (!ADMIN_ROLES.has(role) && bene.user_id !== userId) throw new AppError('NOT_FOUND', 'Beneficiary not found', 404);
  return bene;
};

export const updateBeneficiary = async (id, tenantId, userId, payload, role = null) => {
  const existing = await repo.findById(id, tenantId);
  if (!existing) throw new AppError('NOT_FOUND', 'Beneficiary not found', 404);
  if (!ADMIN_ROLES.has(role) && existing.user_id !== userId) throw new AppError('NOT_FOUND', 'Beneficiary not found', 404);

  const updateData = {};
  if (payload.name !== undefined) updateData.name = payload.name;
  if (payload.countryCode !== undefined) updateData.country_code = payload.countryCode.toUpperCase();
  if (payload.currency !== undefined) updateData.currency = payload.currency.toUpperCase();
  if (payload.bankName !== undefined) updateData.bank_name = payload.bankName;
  if (payload.bankAddress !== undefined) updateData.bank_address = payload.bankAddress;
  if (payload.accountNumber !== undefined) updateData.account_number = payload.accountNumber;
  if (payload.routingNumber !== undefined) updateData.routing_number = payload.routingNumber;
  if (payload.sortCode !== undefined) updateData.sort_code = payload.sortCode;
  if (payload.ifscCode !== undefined) updateData.ifsc_code = payload.ifscCode;
  if (payload.iban !== undefined) updateData.iban = payload.iban;
  if (payload.swiftBic !== undefined) updateData.swift_bic = payload.swiftBic;
  if (payload.purposeCode !== undefined) updateData.purpose_code = payload.purposeCode;

  // Reset screening status on update
  if (Object.keys(updateData).length > 0) {
    updateData.screening_status = 'pending';
  }

  const updated = await repo.update(id, tenantId, updateData);
  if (!updated) throw new AppError('NOT_FOUND', 'Beneficiary not found', 404);

  enqueueScreening(id, tenantId);
  return updated;
};

export const deleteBeneficiary = async (id, tenantId, userId, role = null) => {
  const existing = await repo.findById(id, tenantId);
  if (!existing) throw new AppError('NOT_FOUND', 'Beneficiary not found', 404);
  if (!ADMIN_ROLES.has(role) && existing.user_id !== userId) throw new AppError('NOT_FOUND', 'Beneficiary not found', 404);

  await repo.softDelete(id, tenantId);
  return { success: true };
};

// Used by Phase 5 payments — checks beneficiary is active and not blocked
export const getBeneficiaryOrThrow = async (id, tenantId) => {
  const bene = await repo.findById(id, tenantId);
  if (!bene) throw new AppError('NOT_FOUND', 'Beneficiary not found', 404);
  if (bene.screening_status === 'blocked') {
    throw new AppError('BENEFICIARY_BLOCKED', 'Beneficiary has been blocked by compliance screening', 422);
  }
  return bene;
};
