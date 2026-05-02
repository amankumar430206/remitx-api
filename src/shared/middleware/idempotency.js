import redis from '../../config/redis.js';
import { AppError } from '../errors/AppError.js';

export const requireIdempotencyKey = async (req, res, next) => {
  const key = req.headers['idempotency-key'];
  if (!key) {
    throw new AppError('VALIDATION_ERROR', 'Idempotency-Key header is required', 400);
  }

  const redisKey = `idem:${req.tenantId}:${key}`;
  const existing = await redis.get(redisKey);

  if (existing) {
    const cached = JSON.parse(existing);
    return res.status(cached.status).json(cached.body);
  }

  const originalJson = res.json.bind(res);
  res.json = async (body) => {
    if (res.statusCode < 500) {
      await redis.setex(redisKey, 86400, JSON.stringify({ status: res.statusCode, body }));
    }
    return originalJson(body);
  };

  next();
};
