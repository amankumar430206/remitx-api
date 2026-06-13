import Joi from 'joi';

const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'AED', 'SGD', 'CAD', 'AUD', 'JPY', 'CNY', 'CHF', 'NZD'];

export const provisionAccountSchema = Joi.object({
  currency: Joi.string().length(3).uppercase().valid(...SUPPORTED_CURRENCIES).required(),
  label:    Joi.string().max(128).optional().allow(''),
});

export const ledgerQuerySchema = Joi.object({
  from: Joi.date().iso().optional(),
  to: Joi.date().iso().optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
});

export const adjustBalanceSchema = Joi.object({
  type: Joi.string().valid('credit', 'debit').required(),
  amount: Joi.string().pattern(/^\d+(\.\d{1,8})?$/).required(),
  description: Joi.string().min(3).max(255).required(),
});
