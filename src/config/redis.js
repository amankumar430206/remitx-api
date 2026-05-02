import Redis from 'ioredis';
import { config } from './index.js';
import { logger } from '../shared/utils/logger.js';

const redis = new Redis(config.redisUrl, {
  maxRetriesPerRequest: 3,
  lazyConnect: false,
  enableReadyCheck: true,
});

redis.on('error', (err) => {
  logger.error({ err: err.message }, 'Redis connection error');
});

redis.on('connect', () => {
  logger.info('Redis connected');
});

export default redis;
