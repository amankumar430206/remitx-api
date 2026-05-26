import Joi from 'joi';

const passwordStrength = Joi.string()
  .min(12)
  .pattern(/[A-Z]/, 'uppercase')
  .pattern(/[a-z]/, 'lowercase')
  .pattern(/[0-9]/, 'number')
  .pattern(/[^A-Za-z0-9]/, 'special character')
  .required();

export const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
  mfaCode: Joi.string().length(6).optional(),
});

export const refreshSchema = Joi.object({
  refreshToken: Joi.string().required(),
});

export const mfaVerifySchema = Joi.object({
  code: Joi.string().length(6).required(),
});

export const mfaChallengeSchema = Joi.object({
  tempToken: Joi.string().required(),
  code: Joi.string().length(6).required(),
});

export const passwordResetRequestSchema = Joi.object({
  email: Joi.string().email().required(),
});

export const passwordResetSchema = Joi.object({
  token: Joi.string().required(),
  password: passwordStrength,
});

export const inviteAcceptSchema = Joi.object({
  token: Joi.string().required(),
  password: passwordStrength,
  firstName: Joi.string().min(1).max(128).required(),
  lastName: Joi.string().min(1).max(128).required(),
  phone: Joi.string().max(32).optional().allow(''),
});

export const registerSchema = Joi.object({
  slug: Joi.string().lowercase().pattern(/^[a-z0-9-]+$/).min(3).max(64).required()
    .messages({ 'string.pattern.base': 'Slug may only contain lowercase letters, numbers and hyphens' }),
  companyName: Joi.string().min(2).max(256).required(),
  email: Joi.string().email().required(),
  password: passwordStrength,
  firstName: Joi.string().min(1).max(128).required(),
  lastName: Joi.string().min(1).max(128).required(),
  phone: Joi.string().max(32).optional().allow(''),
});
