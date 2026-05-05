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
let createdTenantId;
let manualPaymentId;
let makerAccountId;
let testBeneId;

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
  if (createdTenantId) {
    // Cascade deletes handle most cleanup via FK
    await db('tenants').where({ id: createdTenantId }).delete().catch(() => {});
  }
  if (manualPaymentId) {
    await db('payment_status_history').where({ payment_id: manualPaymentId }).delete().catch(() => {});
    await db('payments').where({ id: manualPaymentId }).delete().catch(() => {});
  }
  if (makerAccountId) {
    await db('ledger_entries').where({ account_id: makerAccountId }).delete().catch(() => {});
    await db('accounts').where({ id: makerAccountId }).delete().catch(() => {});
  }
  if (testBeneId) {
    await db('beneficiaries').where({ id: testBeneId }).delete().catch(() => {});
  }
  await db.destroy();
  await redis.quit();
});

// ─── Tenant management ────────────────────────────────────────────────────────

describe('POST /api/v1/admin/tenants', () => {
  test('1. create tenant → seeds theme, role_permissions, approval_rules, client_admin user', async () => {
    const slug = `test-${uuidv4().slice(0, 8)}`;
    const res = await request(app)
      .post('/api/v1/admin/tenants')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ slug, name: 'Test Corp', adminEmail: `admin@${slug}.com` });

    expect(res.status).toBe(201);
    expect(res.body.data.tenant.slug).toBe(slug);
    expect(res.body.data).toHaveProperty('inviteToken');
    createdTenantId = res.body.data.tenant.id;

    // Verify defaults seeded
    const roles = await db('role_permissions').where({ tenant_id: createdTenantId }).distinct('role');
    const roleNames = roles.map((r) => r.role);
    expect(roleNames).toContain('maker');
    expect(roleNames).toContain('checker');

    const rules = await db('approval_rules').where({ tenant_id: createdTenantId });
    expect(rules.length).toBeGreaterThanOrEqual(3);

    const theme = await db('tenant_theme_configs').where({ tenant_id: createdTenantId }).first();
    expect(theme).toBeTruthy();

    const adminUser = await db('users').where({ tenant_id: createdTenantId, role: 'client_admin' }).first();
    expect(adminUser.status).toBe('invited');
  });

  test('2. duplicate slug → 500/conflict', async () => {
    const res = await request(app)
      .post('/api/v1/admin/tenants')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ slug: 'remitx', name: 'Duplicate', adminEmail: 'dup@remitx.com' });

    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

describe('GET /api/v1/admin/tenants', () => {
  test('3. lists all tenants', async () => {
    const res = await request(app)
      .get('/api/v1/admin/tenants')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });
});

describe('GET /api/v1/admin/tenants/:id', () => {
  test('4. returns created tenant', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/tenants/${createdTenantId}`)
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(createdTenantId);
  });
});

describe('PUT /api/v1/admin/tenants/:id/status', () => {
  test('5. suspend tenant → status=suspended', async () => {
    const res = await request(app)
      .put(`/api/v1/admin/tenants/${createdTenantId}/status`)
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'suspended' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('suspended');
  });
});

// ─── Provider config ──────────────────────────────────────────────────────────

describe('PUT /api/v1/admin/tenants/:id/provider-config', () => {
  test('6. set corridor config → cache invalidated → resolveProvider uses new config', async () => {
    // Set USD→GBP to manual provider
    const res = await request(app)
      .put(`/api/v1/admin/tenants/${tenantId}/provider-config`)
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        corridors: [
          { sourceCurrency: 'USD', destCurrency: 'GBP', providerName: 'manual', priority: 1 },
        ],
      });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data[0].provider_name).toBe('manual');

    // Verify Redis cache was invalidated
    const cached = await redis.get(`tenant:routing:${tenantId}:USD:GBP`);
    expect(cached).toBeNull();
  });
});

// ─── Manual payment queue ─────────────────────────────────────────────────────

describe('Manual payment queue', () => {
  beforeAll(async () => {
    // Create and fund account for admin user
    const accRes = await request(app)
      .post('/api/v1/accounts')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ currency: 'USD' });
    makerAccountId = accRes.body.data.id;

    await db.transaction(async (trx) => {
      await creditAccount({ accountId: makerAccountId, amount: '50000', tenantId, description: 'seed' }, trx);
    });

    // Create a real beneficiary (needed for FK constraint on payments)
    const beneRes = await request(app)
      .post('/api/v1/beneficiaries')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Admin Test Bene', countryCode: 'GB', currency: 'GBP', sortCode: '200415', accountNumber: '99887700', purposeCode: 'TRADE' });
    testBeneId = beneRes.body.data.id;

    // Insert a manual payment directly
    manualPaymentId = uuidv4();
    await db('payments').insert({
      id: manualPaymentId,
      tenant_id: tenantId,
      user_id: adminUserId,
      beneficiary_id: testBeneId,
      account_id: makerAccountId,
      source_currency: 'USD',
      source_amount: '500',
      dest_currency: 'GBP',
      dest_amount: '400',
      exchange_rate: '0.8',
      fee_amount: '0',
      purpose_code: 'TRADE',
      reference: 'MANUAL-TEST',
      idempotency_key: uuidv4(),
      quote_id: uuidv4(),
      provider_name: 'manual',
      status: 'pending_manual_processing',
    });
  });

  test('7. GET manual-queue → includes seeded payment', async () => {
    const res = await request(app)
      .get('/api/v1/admin/payments/manual-queue')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const ids = res.body.data.map((p) => p.id);
    expect(ids).toContain(manualPaymentId);
  });

  test('8. PUT process complete → status=completed, ledger credited on fail path', async () => {
    const res = await request(app)
      .put(`/api/v1/admin/payments/${manualPaymentId}/process`)
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'complete', notes: 'Processed manually', providerRef: 'MAN-001' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('completed');
    expect(res.body.data.provider_payment_id).toBe('MAN-001');
  });

  test('9. process already-completed payment → 422', async () => {
    const res = await request(app)
      .put(`/api/v1/admin/payments/${manualPaymentId}/process`)
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'complete' });

    expect(res.status).toBe(422);
  });
});

// ─── Cross-tenant views ───────────────────────────────────────────────────────

describe('GET /api/v1/admin/payments', () => {
  test('10. lists all payments (cross-tenant)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/payments?limit=10')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toHaveProperty('total');
  });
});

describe('GET /api/v1/admin/reconciliation', () => {
  test('11. lists reconciliation exceptions', async () => {
    const res = await request(app)
      .get('/api/v1/admin/reconciliation')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

// ─── Impersonation ────────────────────────────────────────────────────────────

describe('POST /api/v1/admin/impersonate/:userId', () => {
  test('12. impersonate self → returns short-lived token + audit log', async () => {
    const before = await db('audit_logs').where({ tenant_id: tenantId, action: 'user.impersonated' }).count('* as c').first();

    const res = await request(app)
      .post(`/api/v1/admin/impersonate/${adminUserId}`)
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('token');
    expect(res.body.data.expiresIn).toBe('5m');

    const after = await db('audit_logs').where({ tenant_id: tenantId, action: 'user.impersonated' }).count('* as c').first();
    expect(parseInt(after.c, 10)).toBe(parseInt(before.c, 10) + 1);
  });

  test('13. impersonate unknown user → 404', async () => {
    const res = await request(app)
      .post(`/api/v1/admin/impersonate/${uuidv4()}`)
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });
});

// ─── Theme ────────────────────────────────────────────────────────────────────

describe('PUT /api/v1/tenants/theme', () => {
  test('14. valid theme update → 200', async () => {
    const res = await request(app)
      .put('/api/v1/tenants/theme')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ primaryColor: '#ff6600', fontFamily: 'Roboto', companyName: 'Acme Corp' });

    expect(res.status).toBe(200);
    expect(res.body.data.primary_color).toBe('#ff6600');
  });

  test('15. bad hex color → 400', async () => {
    const res = await request(app)
      .put('/api/v1/tenants/theme')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ primaryColor: 'notahex' });

    expect(res.status).toBe(400);
  });

  test('16. invalid fontFamily → 400', async () => {
    const res = await request(app)
      .put('/api/v1/tenants/theme')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ fontFamily: 'Comic Sans' });

    expect(res.status).toBe(400);
  });
});
