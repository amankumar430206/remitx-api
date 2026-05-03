import Joi from 'joi';

const UUID = Joi.string().uuid({ version: 'uuidv4' });

export const submitPaymentSchema = Joi.object({
  beneficiaryId: UUID.required(),
  accountId: UUID.required(),
  quoteId: UUID.required(),
  purposeCode: Joi.string().valid(
    'TRADE', 'SUPPLIER', 'SALARY', 'SERVICES', 'CONTRACTOR', 'OTHER',
  ).required(),
  note: Joi.string().max(1024).optional().allow('', null),
});

export const rejectPaymentSchema = Joi.object({
  reason: Joi.string().min(1).max(1024).required(),
});
