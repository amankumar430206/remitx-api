import Joi from 'joi';

const PURPOSE_CODES = ['TRADE', 'SUPPLIER', 'SALARY', 'SERVICES', 'CONTRACTOR', 'OTHER'];
const ENTITY_TYPES  = ['INDIVIDUAL', 'COMPANY'];
const TRANSFER_METHODS = ['SWIFT', 'LOCAL', 'SEPA', 'ACH', 'WIRE', 'FASTER_PAYMENTS'];

const EU_IBAN_COUNTRIES = ['DE', 'FR', 'IT', 'ES', 'NL', 'BE', 'AT', 'PT', 'PL', 'SE', 'DK', 'FI', 'NO', 'CH', 'IE'];

const corridorSchema = Joi.object({
  // ── Entity ──────────────────────────────────────────────────────────────────
  entityType:  Joi.string().valid(...ENTITY_TYPES).required(),
  name:        Joi.string().min(1).max(256).required(), // company name OR full display name
  firstName:   Joi.when('entityType', {
    is: 'INDIVIDUAL',
    then: Joi.string().min(1).max(128).optional().allow('', null),
    otherwise: Joi.string().optional().allow('', null),
  }),
  lastName:    Joi.when('entityType', {
    is: 'INDIVIDUAL',
    then: Joi.string().min(1).max(128).optional().allow('', null),
    otherwise: Joi.string().optional().allow('', null),
  }),

  // ── Corridor ────────────────────────────────────────────────────────────────
  countryCode:    Joi.string().length(2).uppercase().required(),
  currency:       Joi.string().length(3).uppercase().required(),
  purposeCode:    Joi.string().valid(...PURPOSE_CODES).required(),
  transferMethod: Joi.string().valid(...TRANSFER_METHODS).optional().allow('', null),

  // ── Bank ────────────────────────────────────────────────────────────────────
  bankName:    Joi.string().max(256).optional().allow('', null),
  bankAddress: Joi.string().max(1024).optional().allow('', null),
  accountName: Joi.string().max(256).optional().allow('', null),

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

  // IBAN
  iban: Joi.when('countryCode', {
    is: 'AE',
    then: Joi.string().pattern(/^AE\d{21}$/).required().messages({
      'string.pattern.base': 'IBAN must match AE format: AE followed by 21 digits',
    }),
    otherwise: Joi.when('countryCode', {
      is: Joi.valid(...EU_IBAN_COUNTRIES),
      then: Joi.string().pattern(/^[A-Z]{2}\d{2}[A-Z0-9]{4,30}$/).required().messages({
        'string.pattern.base': 'IBAN must be a valid IBAN format',
      }),
      otherwise: Joi.string().optional().allow('', null),
    }),
  }),

  // Account number
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
          otherwise: Joi.string().min(1).max(64).required(),
        }),
      }),
    }),
  }),

  // SWIFT / BIC
  swiftBic: Joi.when('countryCode', {
    is: Joi.valid('US', 'GB', 'IN', 'AE', ...EU_IBAN_COUNTRIES),
    then: Joi.string().pattern(/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/).optional().allow('', null),
    otherwise: Joi.string().pattern(/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/).required().messages({
      'string.pattern.base': 'swiftBic must be a valid BIC/SWIFT code (8 or 11 characters)',
    }),
  }),

  // ── Address ─────────────────────────────────────────────────────────────────
  addressLine1: Joi.string().max(256).optional().allow('', null),
  addressLine2: Joi.string().max(256).optional().allow('', null),
  city:         Joi.string().max(128).optional().allow('', null),
  state:        Joi.string().max(128).optional().allow('', null),
  postalCode:   Joi.string().max(32).optional().allow('', null),
});

export const createBeneficiarySchema = corridorSchema;

export const updateBeneficiarySchema = Joi.object({
  entityType:     Joi.string().valid(...ENTITY_TYPES).optional(),
  name:           Joi.string().min(1).max(256).optional(),
  firstName:      Joi.string().max(128).optional().allow('', null),
  lastName:       Joi.string().max(128).optional().allow('', null),
  countryCode:    Joi.string().length(2).uppercase().optional(),
  currency:       Joi.string().length(3).uppercase().optional(),
  bankName:       Joi.string().max(256).optional().allow('', null),
  bankAddress:    Joi.string().max(1024).optional().allow('', null),
  accountName:    Joi.string().max(256).optional().allow('', null),
  purposeCode:    Joi.string().valid(...PURPOSE_CODES).optional(),
  transferMethod: Joi.string().valid(...TRANSFER_METHODS).optional().allow('', null),
  routingNumber:  Joi.string().optional().allow('', null),
  sortCode:       Joi.string().optional().allow('', null),
  ifscCode:       Joi.string().optional().allow('', null),
  iban:           Joi.string().optional().allow('', null),
  accountNumber:  Joi.string().optional().allow('', null),
  swiftBic:       Joi.string().optional().allow('', null),
  addressLine1:   Joi.string().max(256).optional().allow('', null),
  addressLine2:   Joi.string().max(256).optional().allow('', null),
  city:           Joi.string().max(128).optional().allow('', null),
  state:          Joi.string().max(128).optional().allow('', null),
  postalCode:     Joi.string().max(32).optional().allow('', null),
});
