import * as svc from './notifications.service.js';
import { attachSseClient } from '../../config/sse.js';

export const list = async (req, res) => {
  const page = parseInt(req.query.page || '1', 10);
  const limit = parseInt(req.query.limit || '20', 10);
  const { unread } = req.query;
  const result = await svc.listNotifications(req.user.sub, req.user.tenantId, { page, limit, unread });
  res.json({ success: true, ...result });
};

export const markRead = async (req, res) => {
  const data = await svc.markOneRead(req.params.id, req.user.sub, req.user.tenantId);
  res.json({ success: true, data });
};

export const markAllRead = async (req, res) => {
  const data = await svc.markAllRead(req.user.sub, req.user.tenantId);
  res.json({ success: true, data });
};

export const stream = (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
  res.flushHeaders();

  // Send initial connection confirmation
  res.write(`data: ${JSON.stringify({ type: 'connected', userId: req.user.sub })}\n\n`);

  const cleanup = attachSseClient(req.user.sub, req.user.tenantId, res);

  // Keepalive ping every 25s to prevent proxy timeouts
  const ping = setInterval(() => {
    try { res.write(': ping\n\n'); } catch { /* client gone */ }
  }, 25_000);

  req.on('close', () => {
    clearInterval(ping);
    cleanup();
  });
};
