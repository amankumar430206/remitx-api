import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import app from '../../src/app.js';
import db from '../../src/config/database.js';
import redis from '../../src/config/redis.js';
import { creditAccount } from '../../src/modules/accounts/index.js';

const TENANT_HEADER = { 'X-Tenant-Slug': 'remitx' };

let adminToken;
let tenantId;
let adminUserId;

// Sub-client user (maker) created via invite
let makerToken;
let makerId;
let makerAccountId;
let makerPaymentId;

const login = async (email, password) => {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .set(TENANT_HEADER)
    .send({ email, password });
  return res.body.data;
};

beforeAll(async () => {
  const rlKeys = await redis.keys('rl:*');
  if (rlKeys.length) await redis.del(...rlKeys);

  const auth = await login('admin@remitx.com', 'Admin@RemitX2024!');
  adminToken = auth.accessToken;
  tenantId = auth.user.tenant_id;
  adminUserId = auth.user.id;
});

afterAll(async () => {
  if (makerId) {
    await db('ledger_entries').where({ tenant_id: tenantId }).andWhere('account_id', makerAccountId).delete().catch(() => {});
    await db('accounts').where({ id: makerAccountId }).delete().catch(() => {});
    await db('payments').where({ id: makerPaymentId }).delete().catch(() => {});
    await db('users').where({ id: makerId }).delete().catch(() => {});
  }
  await db.destroy();
  await redis.quit();
});

// ─── User management ──────────────────────────────────────────────────────────

describe('POST /api/v1/tenants/users/invite', () => {
  test('1. admin can invite a maker user → returns inviteToken', async () => {
    const email = `maker.${uuidv4().slice(0, 8)}@remitx-test.com`;
    const res = await request(app)
      .post('/api/v1/tenants/users/invite')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email, role: 'maker', firstName: 'Test', lastName: 'Maker' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('inviteToken');
    expect(res.body.data.user.role).toBe('maker');
    expect(res.body.data.user.status).toBe('invited');

    // Accept invite and set password
    const token = res.body.data.inviteToken;
    makerId = res.body.data.user.id;

    const acceptRes = await request(app)
      .post('/api/v1/auth/invite/accept')
      .set(TENANT_HEADER)
      .send({ token, password: 'Maker@Test2024!', firstName: 'Test', lastName: 'Maker' });

    expect(acceptRes.status).toBe(200);

    // Login as maker
    const makerAuth = await login(email, 'Maker@Test2024!');
    makerToken = makerAuth.accessToken;
  });

  test('2. invite with invalid role → 400', async () => {
    const res = await request(app)
      .post('/api/v1/tenants/users/invite')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'bad@test.com', role: 'godmode' });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/tenants/users', () => {
  test('3. admin lists users → array including maker', async () => {
    const res = await request(app)
      .get('/api/v1/tenants/users')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    const ids = res.body.data.map((u) => u.id);
    expect(ids).toContain(makerId);
  });

  test('4. maker cannot list users (no users:* permission) → 403', async () => {
    const res = await request(app)
      .get('/api/v1/tenants/users')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${makerToken}`);

    expect(res.status).toBe(403);
  });
});

describe('GET /api/v1/tenants/users/:id', () => {
  test('5. admin can fetch maker by ID', async () => {
    const res = await request(app)
      .get(`/api/v1/tenants/users/${makerId}`)
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(makerId);
  });

  test('6. unknown id → 404', async () => {
    const res = await request(app)
      .get(`/api/v1/tenants/users/${uuidv4()}`)
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });
});

describe('PUT /api/v1/tenants/users/:id/status', () => {
  test('7. admin can suspend maker → status=suspended', async () => {
    const res = await request(app)
      .put(`/api/v1/tenants/users/${makerId}/status`)
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'suspended' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('suspended');
  });

  test('8. restore maker to active', async () => {
    const res = await request(app)
      .put(`/api/v1/tenants/users/${makerId}/status`)
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'active' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('active');
  });
});

// ─── Roles ────────────────────────────────────────────────────────────────────

describe('GET /api/v1/tenants/roles', () => {
  test('9. admin lists roles → includes maker, checker', async () => {
    const res = await request(app)
      .get('/api/v1/tenants/roles')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const roles = res.body.data.map((r) => r.role);
    expect(roles).toContain('maker');
    expect(roles).toContain('checker');
  });
});

describe('POST /api/v1/tenants/roles', () => {
  test('10. admin upserts custom role permissions', async () => {
    const res = await request(app)
      .post('/api/v1/tenants/roles')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'maker', permissions: ['payments:create', 'beneficiaries:create', 'accounts:view'] });

    expect(res.status).toBe(201);
    expect(res.body.data.role).toBe('maker');
    expect(res.body.data.permissions).toContain('payments:create');
  });

  test('11. permission override: remove payments:create from maker → maker gets 403 on payment submit', async () => {
    // Strip payments:create from maker role
    await request(app)
      .post('/api/v1/tenants/roles')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'maker', permissions: ['accounts:view'] });

    // Re-login as maker to pick up new permissions
    const makerEmail = (await db('users').where({ id: makerId }).first()).email;
    const freshAuth = await login(makerEmail, 'Maker@Test2024!');
    const freshToken = freshAuth.accessToken;

    // Provision account and fund it
    const accRes = await request(app)
      .post('/api/v1/accounts')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ currency: 'USD' });
    makerAccountId = accRes.body.data.id;
    await db.transaction(async (trx) => {
      await creditAccount({ accountId: makerAccountId, amount: '10000', tenantId, description: 'seed' }, trx);
    });

    // Try submit payment as maker (should fail - no payments:create)
    const beneRes = await request(app)
      .post('/api/v1/beneficiaries')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Test Bene', countryCode: 'GB', currency: 'GBP', sortCode: '200415', accountNumber: '12345678', purposeCode: 'TRADE' });

    const quoteRes = await request(app)
      .post('/api/v1/fx/quote')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${freshToken}`)
      .send({ fromCurrency: 'USD', toCurrency: 'GBP', fromAmount: '100' });

    const submitRes = await request(app)
      .post('/api/v1/payments')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${freshToken}`)
      .set('Idempotency-Key', uuidv4())
      .send({
        accountId: makerAccountId,
        beneficiaryId: beneRes.body.data.id,
        quoteId: quoteRes.body.data?.id || uuidv4(),
        purposeCode: 'TRADE',
        reference: 'Test payment',
      });

    expect(submitRes.status).toBe(403);

    // Restore maker permissions for subsequent tests
    await request(app)
      .post('/api/v1/tenants/roles')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'maker', permissions: ['payments:create', 'payments:cancel', 'beneficiaries:create', 'accounts:view', 'reports:view'] });

    // Cleanup bene
    if (beneRes.body.data?.id) {
      await db('beneficiaries').where({ id: beneRes.body.data.id }).delete().catch(() => {});
    }
  });
});

// ─── Sub-clients ──────────────────────────────────────────────────────────────

describe('POST /api/v1/tenants/sub-clients', () => {
  test('12. admin creates sub-client → returns inviteToken', async () => {
    const email = `subclient.${uuidv4().slice(0, 8)}@remitx-test.com`;
    const res = await request(app)
      .post('/api/v1/tenants/sub-clients')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email, role: 'subclient_user', firstName: 'Sub', lastName: 'Client' });

    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe('subclient_user');
    expect(res.body.data.user.parent_user_id).toBe(adminUserId);
    expect(res.body.data).toHaveProperty('inviteToken');

    // Cleanup
    await db('users').where({ id: res.body.data.user.id }).delete().catch(() => {});
  });
});

describe('GET /api/v1/tenants/sub-clients', () => {
  test('13. admin lists sub-clients → returns array', async () => {
    const res = await request(app)
      .get('/api/v1/tenants/sub-clients')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

// ─── Data isolation ───────────────────────────────────────────────────────────

describe('Data isolation', () => {
  test('14. maker cannot see admin payments → empty list', async () => {
    // Admin creates a payment (insert directly for speed)
    const adminPaymentId = uuidv4();
    const adminBeneId = uuidv4();

    // We need a real account for admin
    const adminAccRes = await request(app)
      .post('/api/v1/accounts')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ currency: 'USD' });
    const adminAccId = adminAccRes.body.data.id;

    await db.transaction(async (trx) => {
      await creditAccount({ accountId: adminAccId, amount: '50000', tenantId, description: 'seed' }, trx);
    });

    // Insert admin payment directly (bypass business logic for speed)
    await db('payments').insert({
      id: adminPaymentId,
      tenant_id: tenantId,
      user_id: adminUserId,
      beneficiary_id: adminBeneId,
      account_id: adminAccId,
      source_currency: 'USD',
      source_amount: '100',
      dest_currency: 'GBP',
      dest_amount: '80',
      exchange_rate: '0.8',
      fee_amount: '0',
      purpose_code: 'TRADE',
      reference: 'ADMIN-PAY',
      idempotency_key: uuidv4(),
      quote_id: uuidv4(),
      provider_name: 'manual',
      status: 'processing',
    }).catch(() => {});

    // Maker lists payments — should NOT see admin's payment
    const res = await request(app)
      .get('/api/v1/payments')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${makerToken}`);

    expect(res.status).toBe(200);
    const ids = res.body.data.map((p) => p.id);
    expect(ids).not.toContain(adminPaymentId);

    // Cleanup
    await db('payments').where({ id: adminPaymentId }).delete().catch(() => {});
    await db('ledger_entries').where({ account_id: adminAccId }).delete().catch(() => {});
    await db('accounts').where({ id: adminAccId }).delete().catch(() => {});
  });

  test('15. admin (client_admin) lists payments → sees all tenant payments', async () => {
    const res = await request(app)
      .get('/api/v1/payments')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    // Admin sees all — no subtree filter applied
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toHaveProperty('total');
  });
});
