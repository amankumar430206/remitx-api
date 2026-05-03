import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import app from '../../src/app.js';
import db from '../../src/config/database.js';
import redis from '../../src/config/redis.js';
import { creditAccount } from '../../src/modules/accounts/index.js';

const TENANT_HEADER = { 'X-Tenant-Slug': 'remitx' };

let accessToken;
let tenantId;
let userId;
let accountId;
let beneficiaryId;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const login = async () => {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .set(TENANT_HEADER)
    .send({ email: 'admin@remitx.com', password: 'Admin@RemitX2024!' });
  return res.body.data;
};

const getQuote = async (token, from = 'USD', to = 'GBP', fromAmount = '500') => {
  const res = await request(app)
    .post('/api/v1/fx/quote')
    .set(TENANT_HEADER)
    .set('Authorization', `Bearer ${token}`)
    .send({ from, to, fromAmount });
  return res.body.data;
};

const submitPayment = async (token, overrides = {}) => {
  const quote = await getQuote(token, 'USD', 'GBP', overrides.fromAmount || '500');
  const body = {
    beneficiaryId,
    accountId,
    quoteId: quote.quoteId,
    purposeCode: 'TRADE',
    ...overrides,
  };
  delete body.fromAmount;

  return request(app)
    .post('/api/v1/payments')
    .set(TENANT_HEADER)
    .set('Authorization', `Bearer ${token}`)
    .set('Idempotency-Key', uuidv4())
    .send(body);
};

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  const keys = await redis.keys('rl:*');
  if (keys.length) await redis.del(...keys);

  const auth = await login();
  accessToken = auth.accessToken;
  tenantId = auth.user.tenant_id;
  userId = auth.user.id;

  // Provision a USD account
  const accRes = await request(app)
    .post('/api/v1/accounts')
    .set(TENANT_HEADER)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ currency: 'USD' });
  accountId = accRes.body.data.id;

  // Fund the account so tests can debit
  await db.transaction(async (trx) => {
    await creditAccount({ accountId, amount: '100000', tenantId, description: 'Test funding' }, trx);
  });

  // Create a GB beneficiary
  const beneRes = await request(app)
    .post('/api/v1/beneficiaries')
    .set(TENANT_HEADER)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      name: 'Test Beneficiary',
      countryCode: 'GB',
      currency: 'GBP',
      sortCode: '200415',
      accountNumber: '12345678',
      purposeCode: 'TRADE',
    });
  beneficiaryId = beneRes.body.data.id;
});

afterAll(async () => {
  await db('payment_status_history').where({ tenant_id: tenantId }).delete();
  await db('payments').where({ tenant_id: tenantId }).delete();
  await db('ledger_entries').where({ tenant_id: tenantId }).delete();
  await db('accounts').where({ tenant_id: tenantId }).delete();
  await db('beneficiaries').where({ tenant_id: tenantId }).delete();
  await db.destroy();
  await redis.quit();
});

// ─── Submit ───────────────────────────────────────────────────────────────────

describe('POST /api/v1/payments', () => {
  test('1. auto-approve small payment (<$1000) → 201, status=processing', async () => {
    const res = await submitPayment(accessToken, { fromAmount: '500' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('processing');
    expect(res.body.data.tenant_id).toBe(tenantId);
    expect(res.body.data.user_id).toBe(userId);
    expect(res.body.data.source_currency).toBe('USD');
    expect(res.body.data.dest_currency).toBe('GBP');
  });

  test('2. large payment (≥$1000) → 201, status=pending_approval', async () => {
    const res = await submitPayment(accessToken, { fromAmount: '2000' });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('pending_approval');
  });

  test('3. idempotency — same key returns same payment, no duplicate row', async () => {
    const idemKey = uuidv4();
    const quote1 = await getQuote(accessToken, 'USD', 'GBP', '300');

    const res1 = await request(app)
      .post('/api/v1/payments')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', idemKey)
      .send({ beneficiaryId, accountId, quoteId: quote1.quoteId, purposeCode: 'TRADE' });

    expect(res1.status).toBe(201);
    const paymentId1 = res1.body.data.id;

    // Second request with same key — quote is consumed but idempotency should return existing
    const res2 = await request(app)
      .post('/api/v1/payments')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', idemKey)
      .send({ beneficiaryId, accountId, quoteId: quote1.quoteId, purposeCode: 'TRADE' });

    expect(res2.status).toBe(201);
    expect(res2.body.data.id).toBe(paymentId1);

    const count = await db('payments').where({ idempotency_key: idemKey, tenant_id: tenantId }).count('* as count').first();
    expect(parseInt(count.count, 10)).toBe(1);
  });

  test('4. missing Idempotency-Key → 400', async () => {
    const quote = await getQuote(accessToken);
    const res = await request(app)
      .post('/api/v1/payments')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ beneficiaryId, accountId, quoteId: quote.quoteId, purposeCode: 'TRADE' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('5. expired/invalid FX quote → 422 FX_QUOTE_EXPIRED', async () => {
    const res = await request(app)
      .post('/api/v1/payments')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', uuidv4())
      .send({ beneficiaryId, accountId, quoteId: uuidv4(), purposeCode: 'TRADE' });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('FX_QUOTE_EXPIRED');
  });

  test('6. insufficient balance → 422 INSUFFICIENT_BALANCE', async () => {
    // Create a fresh account with zero balance
    const emptyAccRes = await request(app)
      .post('/api/v1/accounts')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currency: 'USD' });
    const emptyAccId = emptyAccRes.body.data.id;

    const quote = await getQuote(accessToken, 'USD', 'GBP', '100');
    const res = await request(app)
      .post('/api/v1/payments')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', uuidv4())
      .send({ beneficiaryId, accountId: emptyAccId, quoteId: quote.quoteId, purposeCode: 'TRADE' });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INSUFFICIENT_BALANCE');
  });

  test('7. blocked beneficiary → 422 BENEFICIARY_BLOCKED', async () => {
    // Manually block the beneficiary
    await db('beneficiaries').where({ id: beneficiaryId }).update({ screening_status: 'blocked' });

    const res = await submitPayment(accessToken);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('BENEFICIARY_BLOCKED');

    // Restore
    await db('beneficiaries').where({ id: beneficiaryId }).update({ screening_status: 'clear' });
  });

  test('8. no auth → 401', async () => {
    const quote = await getQuote(accessToken);
    const res = await request(app)
      .post('/api/v1/payments')
      .set(TENANT_HEADER)
      .set('Idempotency-Key', uuidv4())
      .send({ beneficiaryId, accountId, quoteId: quote.quoteId, purposeCode: 'TRADE' });

    expect(res.status).toBe(401);
  });
});

// ─── List / Get ───────────────────────────────────────────────────────────────

describe('GET /api/v1/payments', () => {
  test('9. list returns paginated payments', async () => {
    const res = await request(app)
      .get('/api/v1/payments')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toHaveProperty('total');
    expect(res.body.meta.total).toBeGreaterThan(0);
  });

  test('10. GET /:id returns payment with statusHistory', async () => {
    const listRes = await request(app)
      .get('/api/v1/payments')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`);

    const paymentId = listRes.body.data[0].id;
    const res = await request(app)
      .get(`/api/v1/payments/${paymentId}`)
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(paymentId);
    expect(Array.isArray(res.body.data.statusHistory)).toBe(true);
    expect(res.body.data.statusHistory.length).toBeGreaterThan(0);
  });

  test('11. GET non-existent id → 404', async () => {
    const res = await request(app)
      .get(`/api/v1/payments/${uuidv4()}`)
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(404);
  });
});

// ─── Approve / Reject / Cancel ────────────────────────────────────────────────

describe('Approval flow', () => {
  let pendingPaymentId;

  beforeAll(async () => {
    const res = await submitPayment(accessToken, { fromAmount: '2000' });
    pendingPaymentId = res.body.data.id;
  });

  test('12. self-approval → 403 SELF_APPROVAL', async () => {
    const res = await request(app)
      .put(`/api/v1/payments/${pendingPaymentId}/approve`)
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('SELF_APPROVAL');
  });

  test('13. approve already-completed payment → 422 INVALID_STATE', async () => {
    // Get an auto-approved (processing) payment
    const res1 = await submitPayment(accessToken, { fromAmount: '500' });
    const processingId = res1.body.data.id;

    const approveRes = await request(app)
      .put(`/api/v1/payments/${processingId}/approve`)
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(approveRes.status).toBe(422);
    expect(approveRes.body.error.code).toBe('INVALID_STATE');
  });

  test('14. reject pending payment → 200, status=rejected', async () => {
    const res = await submitPayment(accessToken, { fromAmount: '2000' });
    const payId = res.body.data.id;

    const rejectRes = await request(app)
      .put(`/api/v1/payments/${payId}/reject`)
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ reason: 'Duplicate payment detected' });

    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.data.status).toBe('rejected');
  });

  test('15. cancel pending payment by initiator → 200, status=cancelled', async () => {
    const res = await submitPayment(accessToken, { fromAmount: '2000' });
    const payId = res.body.data.id;

    const cancelRes = await request(app)
      .put(`/api/v1/payments/${payId}/cancel`)
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.status).toBe('cancelled');
  });

  test('16. cannot cancel processing payment → 422 INVALID_STATE', async () => {
    const res = await submitPayment(accessToken, { fromAmount: '500' });
    const processingId = res.body.data.id;

    const cancelRes = await request(app)
      .put(`/api/v1/payments/${processingId}/cancel`)
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(cancelRes.status).toBe(422);
    expect(cancelRes.body.error.code).toBe('INVALID_STATE');
  });
});

// ─── Approval Queue ───────────────────────────────────────────────────────────

describe('GET /api/v1/payments/approval-queue', () => {
  test('17. returns pending_approval payments', async () => {
    const res = await request(app)
      .get('/api/v1/payments/approval-queue')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    for (const p of res.body.data) {
      expect(['pending_approval', 'pending_compliance']).toContain(p.status);
    }
  });
});

// ─── Webhooks ─────────────────────────────────────────────────────────────────

describe('POST /webhooks/dev', () => {
  test('18. dev webhook enqueues job → 200', async () => {
    const paymentRes = await submitPayment(accessToken, { fromAmount: '500' });
    const paymentId = paymentRes.body.data.id;

    const res = await request(app)
      .post('/webhooks/dev')
      .send({
        eventId: uuidv4(),
        eventType: 'payment.completed',
        paymentId,
        tenantId,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('19. missing fields → 400', async () => {
    const res = await request(app)
      .post('/webhooks/dev')
      .send({ eventType: 'payment.completed' });

    expect(res.status).toBe(400);
  });
});
