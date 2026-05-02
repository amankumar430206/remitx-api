import winston from 'winston';
import { config } from '../../config/index.js';

export const logger = winston.createLogger({
  level: config.logLevel,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),
  transports: [
    new winston.transports.Console({
      format: config.nodeEnv === 'development'
        ? winston.format.combine(winston.format.colorize(), winston.format.simple())
        : winston.format.json(),
    }),
  ],
});
