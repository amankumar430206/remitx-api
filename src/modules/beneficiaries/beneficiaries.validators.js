import Joi from 'joi';

const PURPOSE_CODES = ['TRADE', 'SUPPLIER', 'SALARY', 'SERVICES', 'CONTRACTOR', 'OTHER'];

// EU countries that use IBAN (non-exhaustive, key ones)
const EU_IBAN_COUNTRIES = ['DE', 'FR', 'IT', 'ES', 'NL', 'BE', 'AT', 'PT', 'PL', 'SE', 'DK', 'FI', 'NO', 'CH', 'IE'];

const corridorSchema = Joi.object({
  name: Joi.string().min(1).max(256).required(),
  countryCode: Joi.string().length(2).uppercase().required(),
  currency: Joi.string().length(3).uppercase().required(),
  bankName: Joi.string().max(256).optional().allow('', null),
  bankAddress: Joi.string().max(1024).optional().allow('', null),
  purposeCode: Joi.string().valid(...PURPOSE_CODES).required(),

  // US-specific
  routingNumber: Joi.when('countryCode', {
    is: 'US',
    then: Joi.string().pattern(/^\d{9}$/).required().messages({
      'string.pattern.base': 'routingNumber must be exactly 9 digits',
    }),
    otherwise: Joi.string().optional().allow('', null),
  }),

  // GB-specific
  sortCode: Joi.when('countryCode', {
    is: 'GB',
    then: Joi.string().pattern(/^\d{6}$/).required().messages({
      'string.pattern.base': 'sortCode must be exactly 6 digits',
    }),
    otherwise: Joi.string().optional().allow('', null),
  }),

  // IN-specific
  ifscCode: Joi.when('countryCode', {
    is: 'IN',
    then: Joi.string().pattern(/^[A-Z]{4}0[A-Z0-9]{6}$/).required().messages({
      'string.pattern.base': 'ifscCode must match format XXXX0XXXXXX (e.g. HDFC0001234)',
    }),
    otherwise: Joi.string().optional().allow('', null),
  }),

  // IBAN for AE
  iban: Joi.when('countryCode', {
    is: 'AE',
    then: Joi.string().pattern(/^AE\d{21}$/).required().messages({
      'string.pattern.base': 'iban must match AE format: AE followed by 21 digits',
    }),
    otherwise: Joi.when('countryCode', {
      is: Joi.valid(...EU_IBAN_COUNTRIES),
      then: Joi.string().pattern(/^[A-Z]{2}\d{2}[A-Z0-9]{4,30}$/).required().messages({
        'string.pattern.base': 'iban must be a valid IBAN format',
      }),
      otherwise: Joi.string().optional().allow('', null),
    }),
  }),

  // account_number: required for US, GB, IN, and OTHER (not EU IBAN countries or AE)
  accountNumber: Joi.when('countryCode', {
    is: 'US',
    then: Joi.string().pattern(/^\d{4,17}$/).required().messages({
      'string.pattern.base': 'accountNumber must be 4–17 digits for US',
    }),
    otherwise: Joi.when('countryCode', {
      is: 'GB',
      then: Joi.string().pattern(/^\d{8}$/).required().messages({
        'string.pattern.base': 'accountNumber must be exactly 8 digits for GB',
      }),
      otherwise: Joi.when('countryCode', {
        is: 'IN',
        then: Joi.string().pattern(/^\d{9,18}$/).required().messages({
          'string.pattern.base': 'accountNumber must be 9–18 digits for IN',
        }),
        otherwise: Joi.when('countryCode', {
          is: Joi.valid('AE', ...EU_IBAN_COUNTRIES),
          then: Joi.string().optional().allow('', null),
          otherwise: Joi.string().min(1).max(64).required(), // OTHER catch-all
        }),
      }),
    }),
  }),

  // SWIFT/BIC: required for OTHER (non US/GB/IN/EU/AE), optional elsewhere
  swiftBic: Joi.when('countryCode', {
    is: Joi.valid('US', 'GB', 'IN', 'AE', ...EU_IBAN_COUNTRIES),
    then: Joi.string().pattern(/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/).optional().allow('', null),
    otherwise: Joi.string().pattern(/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/).required().messages({
      'string.pattern.base': 'swiftBic must be a valid BIC/SWIFT code (8 or 11 characters)',
    }),
  }),
});

export const createBeneficiarySchema = corridorSchema;
export const updateBeneficiarySchema = Joi.object({
  name: Joi.string().min(1).max(256).optional(),
  countryCode: Joi.string().length(2).uppercase().optional(),
  currency: Joi.string().length(3).uppercase().optional(),
  bankName: Joi.string().max(256).optional().allow('', null),
  bankAddress: Joi.string().max(1024).optional().allow('', null),
  purposeCode: Joi.string().valid(...PURPOSE_CODES).optional(),
  routingNumber: Joi.string().optional().allow('', null),
  sortCode: Joi.string().optional().allow('', null),
  ifscCode: Joi.string().optional().allow('', null),
  iban: Joi.string().optional().allow('', null),
  accountNumber: Joi.string().optional().allow('', null),
  swiftBic: Joi.string().optional().allow('', null),
});
