import request from 'supertest';
import app from '../../src/app.js';
import db from '../../src/config/database.js';
import redis from '../../src/config/redis.js';
import { creditAccount, debitAccount } from '../../src/modules/accounts/index.js';

const TENANT_HEADER = { 'X-Tenant-Slug': 'remitx' };

let accessToken;
let tenantId;
let userId;

beforeAll(async () => {
  // Login as super admin
  const res = await request(app)
    .post('/api/v1/auth/login')
    .set(TENANT_HEADER)
    .send({ email: 'admin@remitx.com', password: 'Admin@RemitX2024!' });

  accessToken = res.body.data.accessToken;
  tenantId = res.body.data.user.tenant_id;
  userId = res.body.data.user.id;
});

afterAll(async () => {
  // Clean up accounts and ledger entries created during tests
  await db('ledger_entries').where({ tenant_id: tenantId }).delete();
  await db('accounts').where({ tenant_id: tenantId }).delete();
  await db.destroy();
  await redis.quit();
});

describe('POST /api/v1/accounts', () => {
  test('1. provision account → 201 with DB row + provider ref', async () => {
    const res = await request(app)
      .post('/api/v1/accounts')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currency: 'USD' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data.currency).toBe('USD');
    expect(res.body.data.provider_name).toBe('manual');
    expect(res.body.data.account_number).toMatch(/^ACC-/);
    expect(res.body.data.tenant_id).toBe(tenantId);
    expect(res.body.data.user_id).toBe(userId);
  });

  test('2. invalid currency → 400', async () => {
    const res = await request(app)
      .post('/api/v1/accounts')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currency: 'XYZ' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('3. no auth → 401', async () => {
    const res = await request(app)
      .post('/api/v1/accounts')
      .set(TENANT_HEADER)
      .send({ currency: 'USD' });

    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/accounts', () => {
  test('4. list accounts returns array', async () => {
    const res = await request(app)
      .get('/api/v1/accounts')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('5. each account includes balance field', async () => {
    const res = await request(app)
      .get('/api/v1/accounts')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    for (const acc of res.body.data) {
      expect(acc).toHaveProperty('balance');
    }
  });
});

describe('Account balance — debit / credit', () => {
  let accountId;

  beforeAll(async () => {
    // Create a EUR account for balance tests
    const res = await request(app)
      .post('/api/v1/accounts')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currency: 'EUR' });

    accountId = res.body.data.id;
  });

  test('6. fresh account balance = 0', async () => {
    const res = await request(app)
      .get(`/api/v1/accounts/${accountId}`)
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.balance).toBe('0.00000000');
    expect(Array.isArray(res.body.data.recentEntries)).toBe(true);
    expect(res.body.data.recentEntries.length).toBe(0);
  });

  test('7. credit → balance increases correctly (Big.js, not float)', async () => {
    await db.transaction(async (trx) => {
      await creditAccount({ accountId, amount: '1000.50', tenantId, description: 'Initial deposit' }, trx);
    });

    const res = await request(app)
      .get(`/api/v1/accounts/${accountId}`)
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.body.data.balance).toBe('1000.50000000');
    expect(res.body.data.recentEntries.length).toBe(1);
    expect(res.body.data.recentEntries[0].entry_type).toBe('credit');
  });

  test('8. debit → balance decreases, balance_after chain correct', async () => {
    await db.transaction(async (trx) => {
      await debitAccount({ accountId, amount: '250.25', tenantId, description: 'Test debit' }, trx);
    });

    const res = await request(app)
      .get(`/api/v1/accounts/${accountId}`)
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.body.data.balance).toBe('750.25000000');
    expect(res.body.data.recentEntries[0].entry_type).toBe('debit');
    expect(res.body.data.recentEntries[0].balance_after).toBe('750.25000000');
  });

  test('9. debit with insufficient balance → 422 INSUFFICIENT_BALANCE', async () => {
    await expect(
      db.transaction(async (trx) => {
        await debitAccount({ accountId, amount: '99999', tenantId, description: 'Big debit' }, trx);
      }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_BALANCE' });
  });

  test('10. GET /accounts/:id/ledger returns paginated entries', async () => {
    const res = await request(app)
      .get(`/api/v1/accounts/${accountId}/ledger`)
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`)
      .query({ page: 1, limit: 10 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toHaveProperty('total');
    expect(res.body.meta).toHaveProperty('page', 1);
    expect(res.body.meta.total).toBeGreaterThanOrEqual(2);
  });
});

describe('Tenant isolation', () => {
  test('11. cannot view another tenant\'s account', async () => {
    // Create a second tenant and account
    const [otherTenant] = await db('tenants')
      .insert({ slug: 'other-test-tenant', name: 'Other Tenant', status: 'active' })
      .returning('*');

    const [otherUser] = await db('users')
      .insert({
        tenant_id: otherTenant.id,
        email: 'other@other.com',
        password_hash: '$2b$12$placeholder',
        role: 'client_admin',
        status: 'active',
      })
      .returning('*');

    const [otherAccount] = await db('accounts')
      .insert({
        tenant_id: otherTenant.id,
        user_id: otherUser.id,
        currency: 'USD',
        account_number: 'ACC-OTHER01',
        provider_name: 'manual',
        status: 'active',
      })
      .returning('*');

    const res = await request(app)
      .get(`/api/v1/accounts/${otherAccount.id}`)
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(404);

    // Cleanup
    await db('accounts').where({ id: otherAccount.id }).delete();
    await db('users').where({ id: otherUser.id }).delete();
    await db('tenants').where({ id: otherTenant.id }).delete();
  });

  test('12. invalid UUID param → 400', async () => {
    const res = await request(app)
      .get('/api/v1/accounts/not-a-valid-uuid')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
