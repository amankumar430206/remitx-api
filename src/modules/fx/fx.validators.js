import Joi from 'joi';

const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'AED', 'SGD', 'CAD', 'AUD'];

const ZOQQ_QUOTE_TYPES         = ['payout', 'conversion'];
const ZOQQ_LOCK_PERIODS        = ['5_mins', '15_mins', '1_hour', '4_hours', '8_hours', '24_hours'];
const ZOQQ_CONVERSION_SCHEDULES = ['immediate', 'end_of_day', 'next_day', '2_days'];

export const lockQuoteSchema = Joi.object({
  from: Joi.string().length(3).uppercase().valid(...SUPPORTED_CURRENCIES).required(),
  to: Joi.string().length(3).uppercase().valid(...SUPPORTED_CURRENCIES).required(),
  fromAmount: Joi.string().pattern(/^\d+(\.\d+)?$/).required().messages({
    'string.pattern.base': 'fromAmount must be a positive numeric string',
  }),
  // Zoqq-specific — ignored for non-Zoqq providers
  quoteType:          Joi.string().valid(...ZOQQ_QUOTE_TYPES).optional(),
  lockPeriod:         Joi.string().valid(...ZOQQ_LOCK_PERIODS).optional(),
  conversionSchedule: Joi.string().valid(...ZOQQ_CONVERSION_SCHEDULES).optional(),
}).custom((value, helpers) => {
  if (value.from === value.to) {
    return helpers.error('any.invalid');
  }
  return value;
}).messages({ 'any.invalid': 'from and to currencies must differ' });
