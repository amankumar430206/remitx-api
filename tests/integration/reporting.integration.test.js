import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import app from '../../src/app.js';
import db from '../../src/config/database.js';
import redis from '../../src/config/redis.js';
import { creditAccount } from '../../src/modules/accounts/index.js';
import { reconcileTenant } from '../../src/workers/reconciliation.worker.js';

const TENANT_HEADER = { 'X-Tenant-Slug': 'remitx' };

let accessToken;
let tenantId;
let userId;
let accountId;
let beneficiaryId;

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

  // Create and fund a USD account
  const accRes = await request(app)
    .post('/api/v1/accounts')
    .set(TENANT_HEADER)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ currency: 'USD' });
  accountId = accRes.body.data.id;

  await db.transaction(async (trx) => {
    await creditAccount({ accountId, amount: '50000', tenantId, description: 'Test seed' }, trx);
  });

  // Create a beneficiary for reconciliation test payment inserts
  const beneRes = await request(app)
    .post('/api/v1/beneficiaries')
    .set(TENANT_HEADER)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ name: 'Reporting Test Bene', countryCode: 'GB', currency: 'GBP', sortCode: '200415', accountNumber: '99887766', purposeCode: 'TRADE' });
  beneficiaryId = beneRes.body.data.id;
});

afterAll(async () => {
  await db('reconciliation_reports').where({ tenant_id: tenantId }).delete();
  await db('audit_logs').where({ tenant_id: tenantId }).delete();
  await db('ledger_entries').where({ account_id: accountId }).delete();
  await db('accounts').where({ id: accountId }).delete();
  if (beneficiaryId) await db('beneficiaries').where({ id: beneficiaryId }).delete();
  await db.destroy();
  await redis.quit();
});

// ─── Statement ────────────────────────────────────────────────────────────────

describe('GET /api/v1/reporting/statement', () => {
  const from = '2020-01-01';
  const to   = '2030-12-31';

  test('1. JSON format → returns ledger entries + openingBalance', async () => {
    const res = await request(app)
      .get(`/api/v1/reporting/statement?accountId=${accountId}&from=${from}&to=${to}`)
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.entries)).toBe(true);
    expect(res.body.data.entries.length).toBeGreaterThan(0);
    expect(res.body.data).toHaveProperty('openingBalance');
  });

  test('2. CSV format → Content-Type text/csv, row count matches entries', async () => {
    const jsonRes = await request(app)
      .get(`/api/v1/reporting/statement?accountId=${accountId}&from=${from}&to=${to}`)
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`);
    const entryCount = jsonRes.body.data.entries.length;

    const csvRes = await request(app)
      .get(`/api/v1/reporting/statement?accountId=${accountId}&from=${from}&to=${to}&format=csv`)
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(csvRes.status).toBe(200);
    expect(csvRes.headers['content-type']).toMatch(/text\/csv/);

    // Count data rows (subtract 1 header row)
    const lines = csvRes.text.trim().split('\n').filter(Boolean);
    expect(lines.length - 1).toBe(entryCount);
  });

  test('3. PDF format → Content-Type application/pdf, streams bytes', async () => {
    const res = await request(app)
      .get(`/api/v1/reporting/statement?accountId=${accountId}&from=${from}&to=${to}&format=pdf`)
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`)
      .buffer(true)
      .parse((res, callback) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
    expect(res.body.length).toBeGreaterThan(100); // non-empty PDF
  });

  test('4. MT940 format → contains SWIFT :20: and :28C: tags', async () => {
    const res = await request(app)
      .get(`/api/v1/reporting/statement?accountId=${accountId}&from=${from}&to=${to}&format=mt940`)
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.text).toMatch(/:20:/);
    expect(res.text).toMatch(/:28C:/);
    expect(res.text).toMatch(/:60F:/);
    expect(res.text).toMatch(/:62F:/);
  });

  test('5. Missing from/to → 400', async () => {
    const res = await request(app)
      .get('/api/v1/reporting/statement')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(400);
  });
});

// ─── Transactions ─────────────────────────────────────────────────────────────

describe('GET /api/v1/reporting/transactions', () => {
  test('6. returns paginated transactions', async () => {
    const res = await request(app)
      .get('/api/v1/reporting/transactions?page=1&limit=10')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toHaveProperty('total');
  });

  test('7. CSV export → Content-Type text/csv', async () => {
    const res = await request(app)
      .get('/api/v1/reporting/transactions?format=csv')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
  });
});

// ─── FX Summary ───────────────────────────────────────────────────────────────

describe('GET /api/v1/reporting/fx-summary', () => {
  test('8. returns FX conversion summary array', async () => {
    const res = await request(app)
      .get('/api/v1/reporting/fx-summary')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

// ─── Reconciliation worker ────────────────────────────────────────────────────

describe('Reconciliation cron — reconcileTenant()', () => {
  const date = '2025-01-15';

  test('9. all payments matched → status=matched, no exceptions', async () => {
    // Insert a completed payment with provider_payment_id (matched)
    const paymentId = uuidv4();
    await db('payments').insert({
      id: paymentId,
      tenant_id: tenantId,
      user_id: userId,
      beneficiary_id: beneficiaryId,
      account_id: accountId,
      source_currency: 'USD',
      source_amount: '1000',
      dest_currency: 'GBP',
      dest_amount: '800',
      exchange_rate: '0.8',
      fee_amount: '0',
      purpose_code: 'TRADE',
      reference: `RMX-TEST-${paymentId.slice(0, 6)}`,
      idempotency_key: uuidv4(),
      quote_id: uuidv4(),
      provider_name: 'manual',
      provider_payment_id: `MAN-${paymentId}`,
      status: 'completed',
      completed_at: new Date(`${date}T12:00:00Z`),
    });

    const report = await reconcileTenant(tenantId, date);

    expect(report.status).toBe('matched');
    expect(report.matched_count).toBeGreaterThanOrEqual(1);
    expect(report.unmatched_count).toBe(0);

    await db('payments').where({ id: paymentId }).delete();
  });

  test('10. payment missing provider_payment_id → exception flagged', async () => {
    const date2 = '2025-02-20';
    const paymentId = uuidv4();
    await db('payments').insert({
      id: paymentId,
      tenant_id: tenantId,
      user_id: userId,
      beneficiary_id: beneficiaryId,
      account_id: accountId,
      source_currency: 'USD',
      source_amount: '500',
      dest_currency: 'EUR',
      dest_amount: '460',
      exchange_rate: '0.92',
      fee_amount: '0',
      purpose_code: 'TRADE',
      reference: `RMX-TEST-${paymentId.slice(0, 6)}`,
      idempotency_key: uuidv4(),
      quote_id: uuidv4(),
      provider_name: 'manual',
      provider_payment_id: null,
      status: 'completed',
      completed_at: new Date(`${date2}T10:00:00Z`),
    });

    const report = await reconcileTenant(tenantId, date2);

    expect(report.status).toBe('exceptions');
    expect(report.unmatched_count).toBeGreaterThanOrEqual(1);
    const exceptions = typeof report.exceptions === 'string'
      ? JSON.parse(report.exceptions)
      : report.exceptions;
    expect(exceptions.length).toBeGreaterThanOrEqual(1);
    expect(exceptions[0].reason).toMatch(/unmatched/i);

    await db('payments').where({ id: paymentId }).delete();
  });
});

// ─── Reconciliation HTTP endpoints ────────────────────────────────────────────

describe('GET /api/v1/reporting/reconciliation', () => {
  beforeAll(async () => {
    // Ensure a report for 2025-01-15 exists (reconcileTenant may run on a different DB connection)
    await db('reconciliation_reports')
      .insert({
        tenant_id: tenantId,
        report_date: '2025-01-15',
        total_payments: 1,
        total_amount: '1000.00000000',
        matched_count: 1,
        unmatched_count: 0,
        exceptions: JSON.stringify([]),
        status: 'matched',
      })
      .onConflict(['tenant_id', 'report_date'])
      .merge();
  });

  test('11. lists reconciliation reports', async () => {
    const res = await request(app)
      .get('/api/v1/reporting/reconciliation')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('12. GET /:date → returns specific report', async () => {
    const res = await request(app)
      .get('/api/v1/reporting/reconciliation/2025-01-15')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.report_date).toBe('2025-01-15');
  });

  test('13. GET /:date → 404 for missing date', async () => {
    const res = await request(app)
      .get('/api/v1/reporting/reconciliation/1999-01-01')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(404);
  });
});

// ─── Audit log ────────────────────────────────────────────────────────────────

describe('GET /api/v1/reporting/audit', () => {
  test('14. admin can fetch audit logs (paginated)', async () => {
    const res = await request(app)
      .get('/api/v1/reporting/audit?limit=10')
      .set(TENANT_HEADER)
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toHaveProperty('total');
  });

  test('15. writeAudit creates a row in audit_logs', async () => {
    const { writeAudit } = await import('../../src/shared/utils/audit.js');
    const before = await db('audit_logs').where({ tenant_id: tenantId }).count('* as c').first();

    await writeAudit({
      tenantId,
      actorId: userId,
      action: 'test.audit_write',
      resourceType: 'payment',
      resourceId: uuidv4(),
    });

    const after = await db('audit_logs').where({ tenant_id: tenantId }).count('* as c').first();
    expect(parseInt(after.c, 10)).toBe(parseInt(before.c, 10) + 1);
  });
});
