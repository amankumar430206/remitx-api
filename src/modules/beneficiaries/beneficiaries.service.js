import { complianceQueue } from '../../config/queues.js';
import { AppError } from '../../shared/errors/AppError.js';
import * as repo from './beneficiaries.repository.js';

const toDbRow = (payload, userId, tenantId) => ({
  tenant_id:       tenantId,
  user_id:         userId,
  entity_type:     payload.entityType?.toUpperCase() || 'INDIVIDUAL',
  name:            payload.name,
  first_name:      payload.firstName   || null,
  last_name:       payload.lastName    || null,
  country_code:    payload.countryCode?.toUpperCase(),
  currency:        payload.currency?.toUpperCase(),
  bank_name:       payload.bankName    || null,
  bank_address:    payload.bankAddress || null,
  account_name:    payload.accountName || null,
  account_number:  payload.accountNumber || null,
  routing_number:  payload.routingNumber || null,
  sort_code:       payload.sortCode    || null,
  ifsc_code:       payload.ifscCode    || null,
  iban:            payload.iban        || null,
  swift_bic:       payload.swiftBic    || null,
  transfer_method: payload.transferMethod || null,
  address_line1:   payload.addressLine1 || null,
  address_line2:   payload.addressLine2 || null,
  city:            payload.city        || null,
  state:           payload.state       || null,
  postal_code:     payload.postalCode  || null,
  purpose_code:    payload.purposeCode,
  screening_status: 'pending',
  is_active: true,
});

const enqueueScreening = (beneficiaryId, tenantId) => {
  complianceQueue
    .add('beneficiary.screen', { beneficiaryId, tenantId }, {
      attempts: 2,
      backoff: { type: 'fixed', delay: 5000 },
    })
    .catch(() => {});
};

const ADMIN_ROLES = new Set(['super_admin', 'client_admin']);

export const createBeneficiary = async (payload, userId, tenantId) => {
  const row = await repo.create(toDbRow(payload, userId, tenantId));
  enqueueScreening(row.id, tenantId);
  return row;
};

export const listBeneficiaries = async (tenantId, userIds, { page = 1, limit = 20, search } = {}) => {
  const { data, total } = await repo.list({ tenantId, userIds, page, limit, search });
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

  const strField = (key, dbKey) => { if (payload[key] !== undefined) updateData[dbKey] = payload[key] || null; };

  if (payload.entityType    !== undefined) updateData.entity_type     = payload.entityType.toUpperCase();
  if (payload.name          !== undefined) updateData.name            = payload.name;
  strField('firstName',      'first_name');
  strField('lastName',       'last_name');
  if (payload.countryCode   !== undefined) updateData.country_code    = payload.countryCode.toUpperCase();
  if (payload.currency      !== undefined) updateData.currency        = payload.currency.toUpperCase();
  strField('bankName',       'bank_name');
  strField('bankAddress',    'bank_address');
  strField('accountName',    'account_name');
  strField('accountNumber',  'account_number');
  strField('routingNumber',  'routing_number');
  strField('sortCode',       'sort_code');
  strField('ifscCode',       'ifsc_code');
  strField('iban',           'iban');
  strField('swiftBic',       'swift_bic');
  strField('transferMethod', 'transfer_method');
  strField('addressLine1',   'address_line1');
  strField('addressLine2',   'address_line2');
  strField('city',           'city');
  strField('state',          'state');
  strField('postalCode',     'postal_code');
  if (payload.purposeCode   !== undefined) updateData.purpose_code    = payload.purposeCode;

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

export const getBeneficiaryOrThrow = async (id, tenantId) => {
  const bene = await repo.findById(id, tenantId);
  if (!bene) throw new AppError('NOT_FOUND', 'Beneficiary not found', 404);
  if (bene.screening_status === 'blocked') {
    throw new AppError('BENEFICIARY_BLOCKED', 'Beneficiary has been blocked by compliance screening', 422);
  }
  return bene;
};
