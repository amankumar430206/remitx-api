import request from 'supertest';
import app from '../../src/app.js';
import db from '../../src/config/database.js';
import redis from '../../src/config/redis.js';

const TENANT_HEADER = { 'X-Tenant-Slug': 'remitx' };
const WRONG_TENANT = { 'X-Tenant-Slug': 'nonexistent-tenant-xyz' };

let accessToken;
let refreshToken;

beforeAll(async () => {
  // Clear rate limit keys from previous test runs
  const keys = await redis.keys('rl:*');
  if (keys.length) await redis.del(...keys);
});

afterAll(async () => {
  await db.destroy();
  await redis.quit();
});

describe('POST /api/v1/auth/login', () => {
  test('1. correct credentials → 200 with tokens', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set(TENANT_HEADER)
      .send({ email: 'admin@remitx.com', password: 'Admin@RemitX2024!' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('accessToken');
    expect(res.body.data).toHaveProperty('refreshToken');
    expect(res.body.data.user).not.toHaveProperty('password_hash');
    expect(res.body.data.user).not.toHaveProperty('mfa_secret');

    accessToken = res.body.data.accessToken;
    refreshToken = res.body.data.refreshToken;
  });

  test('2. wrong password → 401 INVALID_CREDENTIALS', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set(TENANT_HEADER)
      .send({ email: 'admin@remitx.com', password: 'WrongPassword!' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  test('3. missing email → 400 VALIDATION_ERROR', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set(TENANT_HEADER)
      .send({ password: 'Admin@RemitX2024!' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('9. login from wrong tenant → 404', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set(WRONG_TENANT)
      .send({ email: 'admin@remitx.com', password: 'Admin@RemitX2024!' });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

describe('POST /api/v1/auth/refresh', () => {
  test('4. valid refresh token → 200 new tokens, old rejected', async () => {
    // Ensure we have a refresh token
    if (!refreshToken) {
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .set(TENANT_HEADER)
        .send({ email: 'admin@remitx.com', password: 'Admin@RemitX2024!' });
      refreshToken = loginRes.body.data.refreshToken;
    }

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .set(TENANT_HEADER)
      .send({ token: refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('accessToken');
    expect(res.body.data).toHaveProperty('refreshToken');

    const oldToken = refreshToken;
    refreshToken = res.body.data.refreshToken;
    accessToken = res.body.data.accessToken;

    // Old refresh token should now be rejected
    const rejectRes = await request(app)
      .post('/api/v1/auth/refresh')
      .set(TENANT_HEADER)
      .send({ token: oldToken });
    expect(rejectRes.status).toBe(401);
  });

  test('5. invalid refresh token → 401', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .set(TENANT_HEADER)
      .send({ token: 'totally-invalid-token-abc123' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });
});

describe('GET /api/v1/auth/me', () => {
  test('7. no token → 401', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set(TENANT_HEADER);

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('8. valid token → 200 user (no password_hash)', async () => {
    if (!accessToken) {
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .set(TENANT_HEADER)
        .send({ email: 'admin@remitx.com', password: 'Admin@RemitX2024!' });
      accessToken = loginRes.body.data.accessToken;
    }

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('email', 'admin@remitx.com');
    expect(res.body.data).not.toHaveProperty('password_hash');
    expect(res.body.data).not.toHaveProperty('mfa_secret');
  });
});

describe('POST /api/v1/auth/logout', () => {
  test('6. logout → 200, subsequent /me with same token → 401', async () => {
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .set(TENANT_HEADER)
      .send({ email: 'admin@remitx.com', password: 'Admin@RemitX2024!' });

    const token = loginRes.body.data.accessToken;

    const logoutRes = await request(app)
      .post('/api/v1/auth/logout')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${token}`);

    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body.success).toBe(true);

    const meRes = await request(app)
      .get('/api/v1/auth/me')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${token}`);

    expect(meRes.status).toBe(401);
  });
});

describe('GET /api/v1/tenants/theme', () => {
  test('10. returns theme config', async () => {
    const res = await request(app)
      .get('/api/v1/tenants/theme')
      .set(TENANT_HEADER);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('primary_color');
    expect(res.body.data).not.toHaveProperty('webhook_secret');
  });
});
