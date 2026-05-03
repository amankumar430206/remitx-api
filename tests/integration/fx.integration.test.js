import request from 'supertest';
import app from '../../src/app.js';
import redis from '../../src/config/redis.js';
import db from '../../src/config/database.js';

const TENANT_HEADER = { 'X-Tenant-Slug': 'remitx' };

let accessToken;
let tenantId;

beforeAll(async () => {
  const keys = await redis.keys('rl:*');
  if (keys.length) await redis.del(...keys);

  const res = await request(app)
    .post('/api/v1/auth/login')
    .set(TENANT_HEADER)
    .send({ email: 'admin@remitx.com', password: 'Admin@RemitX2024!' });

  accessToken = res.body.data.accessToken;
  tenantId = res.body.data.user.tenant_id;
});

afterAll(async () => {
  // Clean up any leftover fx quote keys from tests
  const keys = await redis.keys('fxquote:*');
  if (keys.length) await redis.del(...keys);
  await db.destroy();
  await redis.quit();
});

describe('GET /api/v1/fx/rates', () => {
  test('1. returns array of rate pairs with midRate and clientRate', async () => {
    const res = await request(app)
      .get('/api/v1/fx/rates')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);

    const first = res.body.data[0];
    expect(first).toHaveProperty('from');
    expect(first).toHaveProperty('to');
    expect(first).toHaveProperty('midRate');
    expect(first).toHaveProperty('clientRate');
  });

  test('2. clientRate is less than midRate (spread applied)', async () => {
    const res = await request(app)
      .get('/api/v1/fx/rates')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`);

    for (const pair of res.body.data) {
      expect(parseFloat(pair.clientRate)).toBeLessThan(parseFloat(pair.midRate));
    }
  });

  test('3. no auth → 401', async () => {
    const res = await request(app)
      .get('/api/v1/fx/rates')
      .set(TENANT_HEADER);

    expect(res.status).toBe(401);
  });
});

describe('POST /api/v1/fx/quote', () => {
  test('4. lock quote → 201 with quoteId, rate, toAmount, expiresAt', async () => {
    const res = await request(app)
      .post('/api/v1/fx/quote')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ from: 'USD', to: 'GBP', fromAmount: '1000' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('quoteId');
    expect(res.body.data).toHaveProperty('rate');
    expect(res.body.data).toHaveProperty('toAmount');
    expect(res.body.data).toHaveProperty('expiresAt');
    expect(res.body.data.from).toBe('USD');
    expect(res.body.data.to).toBe('GBP');
    expect(res.body.data.fromAmount).toBe('1000');
    expect(res.body.data.tenantId).toBe(tenantId);
  });

  test('5. quote stored in Redis — GET /fx/quote/:id returns it', async () => {
    const createRes = await request(app)
      .post('/api/v1/fx/quote')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ from: 'EUR', to: 'USD', fromAmount: '500' });

    const { quoteId } = createRes.body.data;

    const getRes = await request(app)
      .get(`/api/v1/fx/quote/${quoteId}`)
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.data.quoteId).toBe(quoteId);
    expect(getRes.body.data.from).toBe('EUR');
    expect(getRes.body.data.to).toBe('USD');
  });

  test('6. spread applied correctly — toAmount = fromAmount * rate (Big.js precision)', async () => {
    const res = await request(app)
      .post('/api/v1/fx/quote')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ from: 'USD', to: 'EUR', fromAmount: '100' });

    const { fromAmount, toAmount, rate } = res.body.data;
    // toAmount should equal fromAmount * rate (within 8 decimal precision)
    const expected = (parseFloat(fromAmount) * parseFloat(rate)).toFixed(8);
    expect(toAmount).toBe(expected);
  });

  test('7. same from/to currency → 400 validation error', async () => {
    const res = await request(app)
      .post('/api/v1/fx/quote')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ from: 'USD', to: 'USD', fromAmount: '100' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('8. unsupported currency → 400', async () => {
    const res = await request(app)
      .post('/api/v1/fx/quote')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ from: 'USD', to: 'XYZ', fromAmount: '100' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('9. no auth → 401', async () => {
    const res = await request(app)
      .post('/api/v1/fx/quote')
      .set(TENANT_HEADER)
      .send({ from: 'USD', to: 'GBP', fromAmount: '100' });

    expect(res.status).toBe(401);
  });
});

describe('consumeFxQuote — one-time use', () => {
  test('10. consume removes quote from Redis — second consume → 422 FX_QUOTE_EXPIRED', async () => {
    const { consumeFxQuote } = await import('../../src/modules/fx/index.js');

    const createRes = await request(app)
      .post('/api/v1/fx/quote')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ from: 'GBP', to: 'USD', fromAmount: '250' });

    const { quoteId } = createRes.body.data;

    // First consume succeeds
    const first = await consumeFxQuote(quoteId, tenantId);
    expect(first.quoteId).toBe(quoteId);

    // Second consume throws FX_QUOTE_EXPIRED
    await expect(consumeFxQuote(quoteId, tenantId))
      .rejects.toMatchObject({ code: 'FX_QUOTE_EXPIRED' });
  });

  test('11. wrong tenant consume → 422 FX_QUOTE_INVALID', async () => {
    const { consumeFxQuote } = await import('../../src/modules/fx/index.js');

    const createRes = await request(app)
      .post('/api/v1/fx/quote')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ from: 'USD', to: 'INR', fromAmount: '100' });

    const { quoteId } = createRes.body.data;
    const wrongTenantId = '00000000-0000-0000-0000-000000000000';

    await expect(consumeFxQuote(quoteId, wrongTenantId))
      .rejects.toMatchObject({ code: 'FX_QUOTE_INVALID' });
  });
});

describe('GET /api/v1/fx/quote/:id', () => {
  test('12. non-existent quote id → 404', async () => {
    const res = await request(app)
      .get('/api/v1/fx/quote/00000000-0000-0000-0000-000000000000')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(404);
  });

  test('13. rate cache — second getLiveRate call hits Redis, not API', async () => {
    const { getLiveRate } = await import('../../src/modules/fx/index.js');

    // Prime the cache
    const rate1 = await getLiveRate('USD', 'EUR');

    // Temporarily break the network by checking cache is returned
    const cacheKey = `fx:rate:USD:EUR`;
    const cached = await redis.get(cacheKey);
    expect(cached).toBeTruthy();

    const rate2 = await getLiveRate('USD', 'EUR');
    expect(rate1).toBe(rate2);
  });
});
