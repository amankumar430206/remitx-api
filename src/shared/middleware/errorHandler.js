import Joi from 'joi';
import { AppError } from '../errors/AppError.js';
import { logger } from '../utils/logger.js';

// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, next) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details || [],
      },
      requestId: req.id,
    });
  }

  if (err instanceof Joi.ValidationError) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: err.details.map((d) => ({
          field: d.path.join('.'),
          message: d.message,
        })),
      },
      requestId: req.id,
    });
  }

  logger.error({ err: err.message, stack: err.stack, requestId: req.id }, 'Unhandled error');

  return res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      details: [],
    },
    requestId: req.id,
  });
};
