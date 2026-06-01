import { createServer } from 'http';
import app from './app.js';
import db from './config/database.js';
import redis from './config/redis.js';
import { config } from './config/index.js';
import { logger } from './shared/utils/logger.js';
import { startWorkers } from './workers/index.js';

const server = createServer(app);

server.listen(config.port, async () => {
  logger.info({ port: config.port, env: config.nodeEnv }, 'RemitX API started');
  await startWorkers();
});

const shutdown = async (signal) => {
  logger.info({ signal }, 'Shutdown signal received');

  const forceExit = setTimeout(() => {
    logger.error('Forced exit after timeout');
    process.exit(1);
  }, 30_000);
  forceExit.unref();

  server.close(async () => {
    try {
      await db.destroy();
      await redis.quit();
      logger.info('Graceful shutdown complete');
      process.exit(0);
    } catch (err) {
      logger.error({ err: err.message }, 'Error during shutdown');
      process.exit(1);
    }
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default server;
