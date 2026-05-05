import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';
import app from '../../src/app.js';
import db from '../../src/config/database.js';
import redis from '../../src/config/redis.js';
import { creditAccount } from '../../src/modules/accounts/index.js';

const TENANT_HEADER = { 'X-Tenant-Slug': 'remitx' };

let adminToken;
let tenantId;
let adminId;

// Non-KYC user state
let pendingUserId;
let pendingUserToken;
let pendingAccountId;
let pendingBeneficiaryId;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const loginAs = async (email, password) => {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .set(TENANT_HEADER)
    .send({ email, password });
  return res.body.data;
};

const getQuote = async (token, fromAmount = '500') => {
  const res = await request(app)
    .post('/api/v1/fx/quote')
    .set(TENANT_HEADER)
    .set('Authorization', `Bearer ${token}`)
    .send({ from: 'USD', to: 'GBP', fromAmount });
  return res.body.data;
};

const submitPayment = async (token, beneId, accId, fromAmount = '500') => {
  const quote = await getQuote(token, fromAmount);
  return request(app)
    .post('/api/v1/payments')
    .set(TENANT_HEADER)
    .set('Authorization', `Bearer ${token}`)
    .set('Idempotency-Key', uuidv4())
    .send({ beneficiaryId: beneId, accountId: accId, quoteId: quote.quoteId, purposeCode: 'TRADE' });
};

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  const rlKeys = await redis.keys('rl:*');
  if (rlKeys.length) await redis.del(...rlKeys);

  // Admin login
  const adminAuth = await loginAs('admin@remitx.com', 'Admin@RemitX2024!');
  adminToken = adminAuth.accessToken;
  tenantId = adminAuth.user.tenant_id;
  adminId = adminAuth.user.id;

  // Create a user without KYC approval
  const hash = await bcrypt.hash('Test@1234!', 12);
  const [user] = await db('users')
    .insert({
      tenant_id: tenantId,
      email: `kyc-test-${uuidv4()}@remitx.com`,
      password_hash: hash,
      role: 'maker',
      kyc_status: 'pending',
      status: 'active',
      first_name: 'KYC',
      last_name: 'TestUser',
    })
    .returning('*');
  pendingUserId = user.id;

  // Log in as the pending user
  const pendingAuth = await loginAs(user.email, 'Test@1234!');
  pendingUserToken = pendingAuth.accessToken;

  // Create an account and fund it using admin token (maker role lacks accounts:create)
  const accRes = await request(app)
    .post('/api/v1/accounts')
    .set(TENANT_HEADER)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ currency: 'USD' });
  pendingAccountId = accRes.body.data.id;

  await db.transaction(async (trx) => {
    await creditAccount({ accountId: pendingAccountId, amount: '200000', tenantId, description: 'Test funding' }, trx);
  });

  // Create a beneficiary using admin token
  const beneRes = await request(app)
    .post('/api/v1/beneficiaries')
    .set(TENANT_HEADER)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      name: 'Compliance Test Beneficiary',
      countryCode: 'GB',
      currency: 'GBP',
      sortCode: '200415',
      accountNumber: '87654321',
      purposeCode: 'TRADE',
    });
  pendingBeneficiaryId = beneRes.body.data.id;
});

afterAll(async () => {
  if (pendingUserId) {
    await db('payment_status_history')
      .whereIn('payment_id', db('payments').where({ user_id: pendingUserId }).select('id'))
      .delete();
    await db('payments').where({ tenant_id: tenantId, user_id: pendingUserId }).delete();
    await db('kyc_applications').where({ tenant_id: tenantId, user_id: pendingUserId }).delete();
  }
  if (pendingAccountId) {
    await db('ledger_entries').where({ account_id: pendingAccountId }).delete();
    await db('accounts').where({ id: pendingAccountId }).delete();
  }
  if (pendingBeneficiaryId) {
    await db('beneficiaries').where({ id: pendingBeneficiaryId }).delete();
  }
  if (pendingUserId) {
    await db('users').where({ id: pendingUserId }).delete();
  }
  await db.destroy();
  await redis.quit();
});

// ─── KYC Guard ────────────────────────────────────────────────────────────────

describe('kycGuard — payment blocked until KYC approved', () => {
  test('1. payment submission rejected for pending-KYC user → 403 KYC_NOT_APPROVED', async () => {
    const res = await submitPayment(pendingUserToken, pendingBeneficiaryId, pendingAccountId);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('KYC_NOT_APPROVED');
  });

  test('2. KYC expired user → 403 KYC_EXPIRED', async () => {
    // Set KYC to approved but expired
    await db('users').where({ id: pendingUserId }).update({
      kyc_status: 'approved',
      kyc_expires_at: new Date(Date.now() - 1000),
    });

    const res = await submitPayment(pendingUserToken, pendingBeneficiaryId, pendingAccountId);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('KYC_EXPIRED');

    // Verify kyc_status was updated to 'expired' in DB
    const user = await db('users').where({ id: pendingUserId }).first();
    expect(user.kyc_status).toBe('expired');

    // Reset for next tests
    await db('users').where({ id: pendingUserId }).update({
      kyc_status: 'pending',
      kyc_expires_at: null,
    });
  });
});

// ─── KYC Initiate + Document Upload ──────────────────────────────────────────

describe('KYC application flow', () => {
  test('3. POST /compliance/kyc/initiate → creates application with status=pending', async () => {
    const res = await request(app)
      .post('/api/v1/compliance/kyc/initiate')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${pendingUserToken}`);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('pending');
    expect(res.body.data.user_id).toBe(pendingUserId);
  });

  test('4. POST /compliance/kyc/initiate again → returns existing application (idempotent)', async () => {
    const res = await request(app)
      .post('/api/v1/compliance/kyc/initiate')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${pendingUserToken}`);

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('pending');
  });

  test('5. GET /compliance/kyc/status → returns current KYC state', async () => {
    const res = await request(app)
      .get('/api/v1/compliance/kyc/status')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${pendingUserToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.kycStatus).toBe('pending');
    expect(res.body.data.application).not.toBeNull();
  });

  test('6. POST /compliance/kyc/documents → updates status to submitted', async () => {
    const res = await request(app)
      .post('/api/v1/compliance/kyc/documents')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${pendingUserToken}`)
      .attach('document', Buffer.from('fake-pdf-content'), { filename: 'passport.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('submitted');
    expect(res.body.data.documents).toHaveLength(1);
    expect(res.body.data.documents[0].filename).toBe('passport.pdf');
  });
});

// ─── Admin KYC Queue ─────────────────────────────────────────────────────────

describe('Admin KYC queue', () => {
  test('7. GET /admin/kyc-queue → returns submitted applications', async () => {
    const res = await request(app)
      .get('/api/v1/admin/kyc-queue')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const apps = res.body.data;
    const ours = apps.find((a) => a.user_id === pendingUserId);
    expect(ours).toBeDefined();
    expect(ours.status).toBe('submitted');
  });

  test('8. PUT /admin/tenants/:id/kyc/:userId/approve → kyc_status=approved on user', async () => {
    const res = await request(app)
      .put(`/api/v1/admin/tenants/${tenantId}/kyc/${pendingUserId}/approve`)
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.kycStatus).toBe('approved');
    expect(res.body.data.kycExpiresAt).toBeDefined();

    // Verify in DB
    const user = await db('users').where({ id: pendingUserId }).first();
    expect(user.kyc_status).toBe('approved');
    expect(user.kyc_expires_at).not.toBeNull();

    const app2 = await db('kyc_applications').where({ user_id: pendingUserId }).first();
    expect(app2.status).toBe('approved');
    expect(app2.reviewed_by).toBe(adminId);
  });

  test('9. POST /compliance/kyc/initiate after approval → 409 CONFLICT', async () => {
    const res = await request(app)
      .post('/api/v1/compliance/kyc/initiate')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${pendingUserToken}`);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });
});

// ─── AML Velocity Checks ──────────────────────────────────────────────────────

describe('AML velocity checks', () => {
  test('10. Payment > $25k → flagged → status=pending_compliance', async () => {
    // pendingUserId is now KYC-approved — can submit payments
    const quote = await getQuote(pendingUserToken, '26000');
    const res = await request(app)
      .post('/api/v1/payments')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${pendingUserToken}`)
      .set('Idempotency-Key', uuidv4())
      .send({
        beneficiaryId: pendingBeneficiaryId,
        accountId: pendingAccountId,
        quoteId: quote.quoteId,
        purposeCode: 'TRADE',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('pending_compliance');
  });

  test('11. Compliance officer can clear flagged payment → status=processing', async () => {
    const [flagged] = await db('payments')
      .where({ tenant_id: tenantId, user_id: pendingUserId, status: 'pending_compliance' })
      .orderBy('created_at', 'desc')
      .limit(1);

    // Admin has compliance:review via super_admin wildcard
    const res = await request(app)
      .put(`/api/v1/compliance/${flagged.id}/clear`)
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ notes: 'Manually verified — clear' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('processing');
  });

  test('12. Compliance officer can block a flagged payment → status=rejected', async () => {
    // Submit another large payment to flag
    const quote = await getQuote(pendingUserToken, '26000');
    const submitRes = await request(app)
      .post('/api/v1/payments')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${pendingUserToken}`)
      .set('Idempotency-Key', uuidv4())
      .send({
        beneficiaryId: pendingBeneficiaryId,
        accountId: pendingAccountId,
        quoteId: quote.quoteId,
        purposeCode: 'TRADE',
      });

    expect(submitRes.body.data.status).toBe('pending_compliance');
    const paymentId = submitRes.body.data.id;

    const res = await request(app)
      .put(`/api/v1/compliance/${paymentId}/block`)
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Suspicious transaction pattern' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('rejected');
  });
});

// ─── Admin KYC Reject ─────────────────────────────────────────────────────────

describe('Admin KYC reject flow', () => {
  let rejectUserId;
  let rejectUserToken;

  beforeAll(async () => {
    const hash = await bcrypt.hash('Test@5678!', 12);
    const [user] = await db('users')
      .insert({
        tenant_id: tenantId,
        email: `kyc-reject-${uuidv4()}@remitx.com`,
        password_hash: hash,
        role: 'maker',
        kyc_status: 'pending',
        status: 'active',
        first_name: 'Reject',
        last_name: 'TestUser',
      })
      .returning('*');
    rejectUserId = user.id;

    const auth = await loginAs(user.email, 'Test@5678!');
    rejectUserToken = auth.accessToken;

    // Initiate and submit KYC
    await request(app)
      .post('/api/v1/compliance/kyc/initiate')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${rejectUserToken}`);

    await request(app)
      .post('/api/v1/compliance/kyc/documents')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${rejectUserToken}`)
      .attach('document', Buffer.from('fake-doc'), { filename: 'id.pdf', contentType: 'application/pdf' });
  });

  afterAll(async () => {
    await db('kyc_applications').where({ user_id: rejectUserId }).delete();
    await db('users').where({ id: rejectUserId }).delete();
  });

  test('13. PUT /admin/tenants/:id/kyc/:userId/reject → kyc_status=rejected', async () => {
    const res = await request(app)
      .put(`/api/v1/admin/tenants/${tenantId}/kyc/${rejectUserId}/reject`)
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Document unclear' });

    expect(res.status).toBe(200);
    expect(res.body.data.kycStatus).toBe('rejected');

    const user = await db('users').where({ id: rejectUserId }).first();
    expect(user.kyc_status).toBe('rejected');

    const kycApp = await db('kyc_applications').where({ user_id: rejectUserId }).first();
    expect(kycApp.status).toBe('rejected');
    expect(kycApp.rejection_reason).toBe('Document unclear');
  });
});
