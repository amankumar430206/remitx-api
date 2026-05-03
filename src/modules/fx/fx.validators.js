import Joi from 'joi';

const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'AED', 'SGD', 'CAD', 'AUD'];

export const lockQuoteSchema = Joi.object({
  from: Joi.string().length(3).uppercase().valid(...SUPPORTED_CURRENCIES).required(),
  to: Joi.string().length(3).uppercase().valid(...SUPPORTED_CURRENCIES).required(),
  fromAmount: Joi.string().pattern(/^\d+(\.\d+)?$/).required().messages({
    'string.pattern.base': 'fromAmount must be a positive numeric string',
  }),
}).custom((value, helpers) => {
  if (value.from === value.to) {
    return helpers.error('any.invalid');
  }
  return value;
}).messages({ 'any.invalid': 'from and to currencies must differ' });
