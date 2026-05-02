import redis from '../../config/redis.js';
import { AppError } from '../errors/AppError.js';

export const rateLimiter = ({ max, window: windowSecs }) => async (req, res, next) => {
  const route = req.route?.path || req.path;
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const key = `rl:${route}:${ip}`;

  const current = await redis.incr(key);
  if (current === 1) {
    await redis.expire(key, windowSecs);
  }

  if (current > max) {
    throw new AppError('TOO_MANY_REQUESTS', 'Rate limit exceeded', 429);
  }

  next();
};
