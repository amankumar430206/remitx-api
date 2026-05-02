import { AppError } from '../errors/AppError.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const validateUUID = (paramName) => (req, res, next) => {
  const value = req.params[paramName];
  if (!UUID_REGEX.test(value)) {
    throw new AppError('VALIDATION_ERROR', `Invalid ${paramName} format`, 400);
  }
  next();
};
