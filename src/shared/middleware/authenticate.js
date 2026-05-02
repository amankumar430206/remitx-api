import jwt from 'jsonwebtoken';
import redis from '../../config/redis.js';
import { config } from '../../config/index.js';
import { AppError } from '../errors/AppError.js';

export const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AppError('UNAUTHORIZED', 'Missing authorization token', 401);
  }

  const token = authHeader.slice(7);

  let payload;
  try {
    payload = jwt.verify(token, config.jwtPublicKey, { algorithms: ['RS256'] });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw new AppError('TOKEN_EXPIRED', 'Token has expired', 401);
    }
    throw new AppError('UNAUTHORIZED', 'Invalid token', 401);
  }

  const blocked = await redis.get(`blocklist:${payload.jti}`);
  if (blocked) {
    throw new AppError('TOKEN_REVOKED', 'Token has been revoked', 401);
  }

  req.user = {
    sub: payload.sub,
    tenantId: payload.tenantId,
    role: payload.role,
    permissions: payload.permissions || [],
    jti: payload.jti,
    exp: payload.exp,
  };

  next();
};
