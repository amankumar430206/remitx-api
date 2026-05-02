import * as service from './auth.service.js';
import * as validators from './auth.validators.js';

export const login = async (req, res) => {
  const { error, value } = validators.loginSchema.validate(req.body);
  if (error) throw error;

  const result = await service.login({ ...value, tenantId: req.tenantId });
  res.json({ success: true, data: result, requestId: req.id });
};

export const refresh = async (req, res) => {
  const { error, value } = validators.refreshSchema.validate(req.body);
  if (error) throw error;

  const result = await service.refresh(value.token);
  res.json({ success: true, data: result, requestId: req.id });
};

export const logout = async (req, res) => {
  await service.logout({
    jti: req.user.jti,
    exp: req.user.exp,
    userId: req.user.sub,
  });
  res.json({ success: true, data: null, requestId: req.id });
};

export const setupMfa = async (req, res) => {
  const result = await service.setupMfa(req.user.sub, req.tenantId);
  res.json({ success: true, data: result, requestId: req.id });
};

export const verifyMfa = async (req, res) => {
  const { error, value } = validators.mfaVerifySchema.validate(req.body);
  if (error) throw error;

  const result = await service.verifyMfa(req.user.sub, req.tenantId, value.code);
  res.json({ success: true, data: result, requestId: req.id });
};

export const mfaChallenge = async (req, res) => {
  const { error, value } = validators.mfaChallengeSchema.validate(req.body);
  if (error) throw error;

  const result = await service.mfaChallenge({ ...value, tenantId: req.tenantId });
  res.json({ success: true, data: result, requestId: req.id });
};

export const passwordResetRequest = async (req, res) => {
  const { error, value } = validators.passwordResetRequestSchema.validate(req.body);
  if (error) throw error;

  const result = await service.passwordResetRequest(value.email, req.tenantId);
  res.json({ success: true, data: result, requestId: req.id });
};

export const passwordReset = async (req, res) => {
  const { error, value } = validators.passwordResetSchema.validate(req.body);
  if (error) throw error;

  const result = await service.passwordReset(value.token, value.password);
  res.json({ success: true, data: result, requestId: req.id });
};

export const acceptInvite = async (req, res) => {
  const { error, value } = validators.inviteAcceptSchema.validate(req.body);
  if (error) throw error;

  const result = await service.acceptInvite(value);
  res.json({ success: true, data: result, requestId: req.id });
};

export const getMe = async (req, res) => {
  const user = await service.getMe(req.user.sub, req.tenantId);
  res.json({ success: true, data: user, requestId: req.id });
};
