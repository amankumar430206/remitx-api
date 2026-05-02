import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../..');

dotenv.config({ path: resolve(root, '.env') });

const readKeyFile = (envVar, fallbackVar) => {
  const filePath = process.env[envVar];
  if (filePath) {
    try {
      return readFileSync(resolve(root, filePath), 'utf-8');
    } catch {
      // fall through
    }
  }
  return process.env[fallbackVar] || '';
};

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(','),

  postgresUrl: process.env.POSTGRES_URL || 'postgresql://remitx:remitx_dev@localhost:5432/remitx',

  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',

  jwtPrivateKey: readKeyFile('JWT_PRIVATE_KEY_FILE', 'JWT_PRIVATE_KEY'),
  jwtPublicKey: readKeyFile('JWT_PUBLIC_KEY_FILE', 'JWT_PUBLIC_KEY'),
  jwtAccessTtl: '15m',
  jwtRefreshTtlDays: 30,

  defaultProvider: process.env.DEFAULT_PROVIDER || 'manual',
  defaultFxSpread: parseFloat(process.env.DEFAULT_FX_SPREAD || '0.005'),
  fxCacheTtlSeconds: parseInt(process.env.FX_CACHE_TTL_SECONDS || '10', 10),
  fxQuoteTtlSeconds: parseInt(process.env.FX_QUOTE_TTL_SECONDS || '120', 10),

  logLevel: process.env.LOG_LEVEL || 'info',
};
