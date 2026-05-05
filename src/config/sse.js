import { EventEmitter } from 'events';
import Redis from 'ioredis';
import { config } from './index.js';
import { logger } from '../shared/utils/logger.js';

// Single Redis subscriber for all SSE clients in this process instance.
// Uses pattern subscribe so all notif:* channels fan out via EventEmitter.
const emitter = new EventEmitter();
emitter.setMaxListeners(2000);

let subscriber = null;

const getSubscriber = () => {
  if (!subscriber) {
    subscriber = new Redis(config.redisUrl, { lazyConnect: false, maxRetriesPerRequest: null });

    subscriber.on('error', (err) => {
      logger.warn({ err: err.message }, 'SSE subscriber Redis error');
    });

    subscriber.psubscribe('notif:*', (err) => {
      if (err) logger.error({ err: err.message }, 'SSE psubscribe failed');
    });

    subscriber.on('pmessage', (pattern, channel, message) => {
      emitter.emit(channel, message);
    });
  }
  return subscriber;
};

// Attach a client to SSE. Returns a cleanup function.
export const attachSseClient = (userId, tenantId, res) => {
  getSubscriber(); // ensure subscriber is initialised

  const userChannel = `notif:user:${userId}`;
  const tenantChannel = `notif:tenant:${tenantId}`;

  const send = (message) => {
    try {
      res.write(`data: ${message}\n\n`);
    } catch {
      // client already gone
    }
  };

  emitter.on(userChannel, send);
  emitter.on(tenantChannel, send);

  return () => {
    emitter.off(userChannel, send);
    emitter.off(tenantChannel, send);
  };
};

// Called by the notification worker to push an event to SSE clients.
export const publishSseEvent = async (channel, payload) => {
  const { default: redis } = await import('./redis.js');
  await redis.publish(channel, JSON.stringify(payload));
};

export const closeSseSubscriber = async () => {
  if (subscriber) {
    await subscriber.quit();
    subscriber = null;
  }
};
