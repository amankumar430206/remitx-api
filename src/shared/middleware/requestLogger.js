import { logger } from '../utils/logger.js';

export const requestLogger = (req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    logger.info({
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      durationMs: Date.now() - start,
      requestId: req.id,
      tenantId: req.tenantId,
      userId: req.user?.sub,
    });
  });

  next();
};
