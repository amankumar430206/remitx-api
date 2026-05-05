import Joi from 'joi';

export const initiateKycSchema = Joi.object({});

export const clearPaymentSchema = Joi.object({
  notes: Joi.string().max(500).optional(),
});

export const blockPaymentSchema = Joi.object({
  reason: Joi.string().max(500).required(),
});

export const rejectKycSchema = Joi.object({
  reason: Joi.string().max(500).required(),
});
