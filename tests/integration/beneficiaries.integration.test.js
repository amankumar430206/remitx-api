import request from 'supertest';
import app from '../../src/app.js';
import db from '../../src/config/database.js';
import redis from '../../src/config/redis.js';

const TENANT_HEADER = { 'X-Tenant-Slug': 'remitx' };

let accessToken;
let tenantId;
let userId;

const usPayload = {
  name: 'John Smith',
  countryCode: 'US',
  currency: 'USD',
  bankName: 'Chase Bank',
  accountNumber: '123456789',
  routingNumber: '021000021',
  purposeCode: 'OTHER',
};

const gbPayload = {
  name: 'Jane Doe',
  countryCode: 'GB',
  currency: 'GBP',
  bankName: 'Barclays',
  accountNumber: '12345678',
  sortCode: '200415',
  purposeCode: 'SALARY',
};

const inPayload = {
  name: 'Raj Patel',
  countryCode: 'IN',
  currency: 'INR',
  bankName: 'SBI',
  accountNumber: '123456789012',
  ifscCode: 'SBIN0001234',
  purposeCode: 'OTHER',
};

const aePayload = {
  name: 'Ahmed Al Maktoum',
  countryCode: 'AE',
  currency: 'AED',
  bankName: 'Emirates NBD',
  iban: 'AE070331234567890123456',
  purposeCode: 'SERVICES',
};

beforeAll(async () => {
  const keys = await redis.keys('rl:*');
  if (keys.length) await redis.del(...keys);

  const res = await request(app)
    .post('/api/v1/auth/login')
    .set(TENANT_HEADER)
    .send({ email: 'admin@remitx.com', password: 'Admin@RemitX2024!' });

  accessToken = res.body.data.accessToken;
  tenantId = res.body.data.user.tenant_id;
  userId = res.body.data.user.id;
});

afterAll(async () => {
  await db('beneficiaries').where({ tenant_id: tenantId }).delete();
  await db.destroy();
  await redis.quit();
});

describe('POST /api/v1/beneficiaries', () => {
  test('1. create US beneficiary → 201 with pending screening status', async () => {
    const res = await request(app)
      .post('/api/v1/beneficiaries')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(usPayload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data.name).toBe('John Smith');
    expect(res.body.data.country_code).toBe('US');
    expect(res.body.data.currency).toBe('USD');
    expect(res.body.data.screening_status).toBe('pending');
    expect(res.body.data.is_active).toBe(true);
    expect(res.body.data.tenant_id).toBe(tenantId);
    expect(res.body.data.user_id).toBe(userId);
  });

  test('2. create GB beneficiary with sort_code → 201', async () => {
    const res = await request(app)
      .post('/api/v1/beneficiaries')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(gbPayload);

    expect(res.status).toBe(201);
    expect(res.body.data.sort_code).toBe('200415');
    expect(res.body.data.account_number).toBe('12345678');
  });

  test('3. create IN beneficiary — IFSC validation accepted', async () => {
    const res = await request(app)
      .post('/api/v1/beneficiaries')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(inPayload);

    expect(res.status).toBe(201);
    expect(res.body.data.ifsc_code).toBe('SBIN0001234');
  });

  test('4. IN beneficiary with invalid IFSC → 400', async () => {
    const res = await request(app)
      .post('/api/v1/beneficiaries')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ ...inPayload, ifscCode: 'INVALID' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('5. AE beneficiary — valid UAE IBAN accepted', async () => {
    const res = await request(app)
      .post('/api/v1/beneficiaries')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(aePayload);

    expect(res.status).toBe(201);
    expect(res.body.data.iban).toBe('AE070331234567890123456');
  });

  test('6. AE beneficiary with non-AE IBAN → 400', async () => {
    const res = await request(app)
      .post('/api/v1/beneficiaries')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ ...aePayload, iban: 'GB29NWBK60161331926819' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('7. missing required field → 400 VALIDATION_ERROR', async () => {
    const res = await request(app)
      .post('/api/v1/beneficiaries')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'No Country' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('8. no auth → 401', async () => {
    const res = await request(app)
      .post('/api/v1/beneficiaries')
      .set(TENANT_HEADER)
      .send(usPayload);

    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/beneficiaries', () => {
  test('9. list returns paginated array', async () => {
    const res = await request(app)
      .get('/api/v1/beneficiaries')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toHaveProperty('total');
    expect(res.body.meta).toHaveProperty('page', 1);
    expect(res.body.meta.total).toBeGreaterThanOrEqual(1);
  });
});

describe('GET /api/v1/beneficiaries/:id', () => {
  let beneficiaryId;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/v1/beneficiaries')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(gbPayload);
    beneficiaryId = res.body.data.id;
  });

  test('10. get single beneficiary by id', async () => {
    const res = await request(app)
      .get(`/api/v1/beneficiaries/${beneficiaryId}`)
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(beneficiaryId);
  });

  test('11. non-existent id → 404', async () => {
    const res = await request(app)
      .get('/api/v1/beneficiaries/00000000-0000-0000-0000-000000000000')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(404);
  });

  test('12. invalid UUID → 400', async () => {
    const res = await request(app)
      .get('/api/v1/beneficiaries/not-a-uuid')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('PUT /api/v1/beneficiaries/:id', () => {
  let beneficiaryId;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/v1/beneficiaries')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(usPayload);
    beneficiaryId = res.body.data.id;
  });

  test('13. update name → screening_status resets to pending', async () => {
    // First set status to clear directly
    await db('beneficiaries').where({ id: beneficiaryId }).update({ screening_status: 'clear' });

    const res = await request(app)
      .put(`/api/v1/beneficiaries/${beneficiaryId}`)
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'John Updated Smith' });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('John Updated Smith');
    expect(res.body.data.screening_status).toBe('pending');
  });
});

describe('DELETE /api/v1/beneficiaries/:id', () => {
  let beneficiaryId;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/v1/beneficiaries')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(usPayload);
    beneficiaryId = res.body.data.id;
  });

  test('14. soft delete → 200, row no longer listed', async () => {
    const deleteRes = await request(app)
      .delete(`/api/v1/beneficiaries/${beneficiaryId}`)
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.success).toBe(true);

    const getRes = await request(app)
      .get(`/api/v1/beneficiaries/${beneficiaryId}`)
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(getRes.status).toBe(404);
  });
});

describe('Tenant isolation', () => {
  test('15. cannot access another tenant\'s beneficiary', async () => {
    const [otherTenant] = await db('tenants')
      .insert({ slug: 'other-bene-tenant', name: 'Other Bene Tenant', status: 'active' })
      .returning('*');

    const [otherUser] = await db('users')
      .insert({
        tenant_id: otherTenant.id,
        email: 'bene-other@other.com',
        password_hash: '$2b$12$placeholder',
        role: 'client_admin',
        status: 'active',
      })
      .returning('*');

    const [otherBene] = await db('beneficiaries')
      .insert({
        tenant_id: otherTenant.id,
        user_id: otherUser.id,
        name: 'Other User Bene',
        country_code: 'US',
        currency: 'USD',
        account_number: '999999999',
        routing_number: '021000021',
        purpose_code: 'OTHER',
        screening_status: 'pending',
        is_active: true,
      })
      .returning('*');

    const res = await request(app)
      .get(`/api/v1/beneficiaries/${otherBene.id}`)
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(404);

    await db('beneficiaries').where({ id: otherBene.id }).delete();
    await db('users').where({ id: otherUser.id }).delete();
    await db('tenants').where({ id: otherTenant.id }).delete();
  });
});
