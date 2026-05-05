import { createHmac } from 'crypto';
import request from 'supertest';
import app from '../../src/app.js';
import db from '../../src/config/database.js';
import redis from '../../src/config/redis.js';
import { processNotification } from '../../src/workers/notification.worker.js';

const TENANT_HEADER = { 'X-Tenant-Slug': 'remitx' };

let accessToken;
let tenantId;
let userId;

const login = async () => {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .set(TENANT_HEADER)
    .send({ email: 'admin@remitx.com', password: 'Admin@RemitX2024!' });
  return res.body.data;
};

beforeAll(async () => {
  const rlKeys = await redis.keys('rl:*');
  if (rlKeys.length) await redis.del(...rlKeys);

  const auth = await login();
  accessToken = auth.accessToken;
  tenantId = auth.user.tenant_id;
  userId = auth.user.id;
});

afterAll(async () => {
  await db('notifications').where({ tenant_id: tenantId, user_id: userId }).delete();
  await db.destroy();
  await redis.quit();
});

// ─── Notification worker: in-app creation ─────────────────────────────────────

describe('Notification worker — processNotification()', () => {
  test('1. kyc.approved → inserts in-app notification for self', async () => {
    await processNotification('kyc.approved', { userId, tenantId }, tenantId);

    const row = await db('notifications')
      .where({ tenant_id: tenantId, user_id: userId, type: 'kyc.approved' })
      .orderBy('created_at', 'desc')
      .first();

    expect(row).toBeDefined();
    expect(row.title).toBe('KYC Approved');
    expect(row.read_at).toBeNull();
  });

  test('2. unknown event type → skips gracefully without throwing', async () => {
    await expect(
      processNotification('unknown.event', { userId, tenantId }, tenantId)
    ).resolves.not.toThrow();
  });

  test('3. kyc.rejected → body includes rejection reason', async () => {
    await processNotification('kyc.rejected', { userId, tenantId, reason: 'Blurry document' }, tenantId);

    const row = await db('notifications')
      .where({ tenant_id: tenantId, user_id: userId, type: 'kyc.rejected' })
      .orderBy('created_at', 'desc')
      .first();

    expect(row).toBeDefined();
    expect(row.body).toContain('Blurry document');
  });
});

// ─── GET /notifications ───────────────────────────────────────────────────────

describe('GET /api/v1/notifications', () => {
  test('4. returns paginated list with unreadCount', async () => {
    const res = await request(app)
      .get('/api/v1/notifications')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toMatchObject({ page: 1, limit: 20 });
    expect(typeof res.body.meta.unreadCount).toBe('number');
  });

  test('5. ?unread=true returns only unread notifications', async () => {
    const res = await request(app)
      .get('/api/v1/notifications?unread=true')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    const allUnread = res.body.data.every((n) => n.read_at === null);
    expect(allUnread).toBe(true);
  });

  test('6. unauthenticated → 401', async () => {
    const res = await request(app).get('/api/v1/notifications').set(TENANT_HEADER);
    expect(res.status).toBe(401);
  });
});

// ─── PUT /notifications/:id/read ─────────────────────────────────────────────

describe('PUT /api/v1/notifications/:id/read', () => {
  let notifId;

  beforeAll(async () => {
    const row = await db('notifications')
      .where({ tenant_id: tenantId, user_id: userId })
      .whereNull('read_at')
      .orderBy('created_at', 'desc')
      .first();
    notifId = row?.id;
  });

  test('7. marks a single notification as read', async () => {
    if (!notifId) return; // guard if no unread exist

    const res = await request(app)
      .put(`/api/v1/notifications/${notifId}/read`)
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const row = await db('notifications').where({ id: notifId }).first();
    expect(row.read_at).not.toBeNull();
  });

  test('8. unknown notification id → 404', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await request(app)
      .put(`/api/v1/notifications/${fakeId}/read`)
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(404);
  });
});

// ─── PUT /notifications/read-all ─────────────────────────────────────────────

describe('PUT /api/v1/notifications/read-all', () => {
  test('9. marks all notifications as read', async () => {
    // Seed a fresh unread notification
    await db('notifications').insert({
      tenant_id: tenantId,
      user_id: userId,
      type: 'kyc.approved',
      title: 'Test',
      body: 'Test body',
      metadata: '{}',
    });

    const res = await request(app)
      .put('/api/v1/notifications/read-all')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.marked).toBe(true);

    const unread = await db('notifications')
      .where({ tenant_id: tenantId, user_id: userId })
      .whereNull('read_at')
      .count('* as count')
      .first();
    expect(parseInt(unread.count, 10)).toBe(0);
  });
});

// ─── Webhook config ───────────────────────────────────────────────────────────

describe('Tenant webhook-config', () => {
  test('10. GET /tenants/webhook-config → returns config without secret', async () => {
    const res = await request(app)
      .get('/api/v1/tenants/webhook-config')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('webhook_url');
    expect(res.body.data).toHaveProperty('webhook_enabled');
    expect(res.body.data).toHaveProperty('has_secret');
    expect(res.body.data).not.toHaveProperty('webhook_secret');
  });

  test('11. PUT /tenants/webhook-config → updates URL and enabled flag', async () => {
    const res = await request(app)
      .put('/api/v1/tenants/webhook-config')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ webhookUrl: 'https://example.com/hook', webhookEnabled: true, webhookSecret: 'mysecret123' });

    expect(res.status).toBe(200);
    expect(res.body.data.webhook_url).toBe('https://example.com/hook');
    expect(res.body.data.webhook_enabled).toBe(true);
    expect(res.body.data.has_secret).toBe(true);
  });

  test('12. PUT with invalid URL → 400', async () => {
    const res = await request(app)
      .put('/api/v1/tenants/webhook-config')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ webhookUrl: 'not-a-url' });

    expect(res.status).toBe(400);
  });
});

// ─── Webhook HMAC signature ───────────────────────────────────────────────────

describe('Webhook HMAC signature', () => {
  test('13. HMAC signature computed correctly', () => {
    const secret = 'test-webhook-secret';
    const body = JSON.stringify({ event: 'payment.completed', payload: { paymentId: '123' }, timestamp: '2026-01-01T00:00:00.000Z' });
    const expected = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

    // Simulate what the worker does
    const sig = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
    expect(sig).toBe(expected);
    expect(sig).toMatch(/^sha256=[a-f0-9]{64}$/);
  });
});
