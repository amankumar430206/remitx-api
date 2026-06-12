import Joi from 'joi';

const PURPOSE_CODES = ['TRADE', 'SUPPLIER', 'SALARY', 'SERVICES', 'CONTRACTOR', 'OTHER'];
const FREQUENCIES   = ['once', 'weekly', 'monthly'];

export const createScheduledPaymentSchema = Joi.object({
  beneficiaryId:  Joi.string().uuid().required(),
  accountId:      Joi.string().uuid().required(),
  sourceCurrency: Joi.string().length(3).uppercase().required(),
  destCurrency:   Joi.string().length(3).uppercase().required(),
  sourceAmount:   Joi.number().positive().required(),
  purposeCode:    Joi.string().valid(...PURPOSE_CODES).required(),
  note:           Joi.string().max(1024).optional().allow(null, ''),
  frequency:      Joi.string().valid(...FREQUENCIES).required(),
  scheduledFor:   Joi.date().iso().greater('now').required(),
  endDate:        Joi.date().iso().greater(Joi.ref('scheduledFor')).optional().allow(null)
    .when('frequency', { is: 'once', then: Joi.forbidden() }),
});

export const updateScheduledPaymentSchema = Joi.object({
  scheduledFor: Joi.date().iso().greater('now').optional(),
  endDate:      Joi.date().iso().optional().allow(null),
  note:         Joi.string().max(1024).optional().allow(null, ''),
}).min(1);
