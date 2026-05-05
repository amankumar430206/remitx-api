import bcrypt from 'bcrypt'

const PASSWORD = 'Test@1234!'

export const seed = async (knex) => {
  const existing = await knex('users').where({ email: 'maker1@remitx.com' }).first()
  if (existing) {
    console.log('[seed] Test data already exists, skipping')
    return
  }

  const pwdHash = await bcrypt.hash(PASSWORD, 12)

  // ── Tenants ────────────────────────────────────────────────────────────────

  const remitx = await knex('tenants').where({ slug: 'remitx' }).first()

  const [acme] = await knex('tenants')
    .insert({ slug: 'acme-corp', name: 'Acme Corp', status: 'active' })
    .returning('*')
  await knex('tenant_theme_configs').insert({
    tenant_id: acme.id,
    primary_color: '#e11d48',
    secondary_color: '#0ea5e9',
    company_name: 'Acme Corp',
    font_family: 'Inter',
    webhook_enabled: false,
  })

  // ── Users: remitx tenant ───────────────────────────────────────────────────

  const insertUser = async (data) => {
    const [u] = await knex('users').insert({ password_hash: pwdHash, ...data }).returning('*')
    await knex('user_password_history').insert({ user_id: u.id, password_hash: pwdHash })
    return u
  }

  const cadmin   = await insertUser({ tenant_id: remitx.id, email: 'cadmin@remitx.com',   first_name: 'Client',   last_name: 'Admin',   role: 'client_admin', kyc_status: 'approved',  status: 'active'   })
  const maker1   = await insertUser({ tenant_id: remitx.id, email: 'maker1@remitx.com',   first_name: 'Alice',    last_name: 'Maker',   role: 'maker',        kyc_status: 'approved',  status: 'active'   })
  const maker2   = await insertUser({ tenant_id: remitx.id, email: 'maker2@remitx.com',   first_name: 'Bob',      last_name: 'Pending', role: 'maker',        kyc_status: 'submitted', status: 'active'   })
  const checker1 = await insertUser({ tenant_id: remitx.id, email: 'checker1@remitx.com', first_name: 'Carol',    last_name: 'Checker', role: 'checker',      kyc_status: 'approved',  status: 'active'   })
  const checker2 = await insertUser({ tenant_id: remitx.id, email: 'checker2@remitx.com', first_name: 'Dave',     last_name: 'Checker', role: 'checker',      kyc_status: 'approved',  status: 'active'   })
  await insertUser({                  tenant_id: remitx.id, email: 'inactive@remitx.com', first_name: 'Inactive', last_name: 'User',    role: 'maker',        kyc_status: 'pending',   status: 'inactive' })

  // Users: suspended user
  await insertUser({ tenant_id: remitx.id, email: 'suspended@remitx.com', first_name: 'Sam', last_name: 'Suspended', role: 'maker', kyc_status: 'approved', status: 'suspended' })

  // ── Users: acme tenant ────────────────────────────────────────────────────

  const acmeAdmin = await insertUser({ tenant_id: acme.id, email: 'admin@acme.com', first_name: 'Acme', last_name: 'Admin', role: 'client_admin', kyc_status: 'approved', status: 'active' })
  const acmeMaker = await insertUser({ tenant_id: acme.id, email: 'maker@acme.com', first_name: 'Acme', last_name: 'Maker', role: 'maker',        kyc_status: 'approved', status: 'active' })

  // ── Accounts ───────────────────────────────────────────────────────────────

  const insertAccount = async (data) => {
    const [a] = await knex('accounts').insert(data).returning('*')
    return a
  }

  const usdAcc   = await insertAccount({ tenant_id: remitx.id, user_id: maker1.id,   currency: 'USD', account_number: 'RX-USD-001', provider_name: 'manual', status: 'active' })
  const gbpAcc   = await insertAccount({ tenant_id: remitx.id, user_id: maker1.id,   currency: 'GBP', account_number: 'RX-GBP-001', provider_name: 'manual', status: 'active' })
  const eurAcc   = await insertAccount({ tenant_id: remitx.id, user_id: maker1.id,   currency: 'EUR', account_number: 'RX-EUR-001', provider_name: 'manual', status: 'active' })
  const cadminAcc = await insertAccount({ tenant_id: remitx.id, user_id: cadmin.id,  currency: 'USD', account_number: 'RX-USD-002', provider_name: 'manual', status: 'active' })
  const acmeAcc  = await insertAccount({ tenant_id: acme.id,   user_id: acmeMaker.id, currency: 'USD', account_number: 'AC-USD-001', provider_name: 'manual', status: 'active' })

  // ── Ledger: opening balances ───────────────────────────────────────────────

  await knex('ledger_entries').insert([
    { tenant_id: remitx.id, account_id: usdAcc.id,    entry_type: 'credit', amount: '75000.00',  currency: 'USD', balance_after: '75000.00',  description: 'Initial funding' },
    { tenant_id: remitx.id, account_id: gbpAcc.id,    entry_type: 'credit', amount: '25000.00',  currency: 'GBP', balance_after: '25000.00',  description: 'Initial funding' },
    { tenant_id: remitx.id, account_id: eurAcc.id,    entry_type: 'credit', amount: '40000.00',  currency: 'EUR', balance_after: '40000.00',  description: 'Initial funding' },
    { tenant_id: remitx.id, account_id: cadminAcc.id, entry_type: 'credit', amount: '150000.00', currency: 'USD', balance_after: '150000.00', description: 'Initial funding' },
    { tenant_id: acme.id,   account_id: acmeAcc.id,   entry_type: 'credit', amount: '50000.00',  currency: 'USD', balance_after: '50000.00',  description: 'Initial funding' },
  ])

  // ── Beneficiaries ─────────────────────────────────────────────────────────

  const insertBene = async (data) => {
    const [b] = await knex('beneficiaries').insert(data).returning('*')
    return b
  }

  const beneGB = await insertBene({ tenant_id: remitx.id, user_id: maker1.id, name: 'John Smith',        country_code: 'GB', currency: 'GBP', bank_name: 'Barclays Bank',     account_number: '12345678',       sort_code: '20-00-00',  purpose_code: 'SALARY',      screening_status: 'cleared', is_active: true })
  const beneUS = await insertBene({ tenant_id: remitx.id, user_id: maker1.id, name: 'Tech Solutions LLC', country_code: 'US', currency: 'USD', bank_name: 'Chase Bank',         account_number: '987654321',      routing_number: '021000021', purpose_code: 'SERVICES',    screening_status: 'cleared', is_active: true })
  const beneEU = await insertBene({ tenant_id: remitx.id, user_id: maker1.id, name: 'Maria Garcia',       country_code: 'ES', currency: 'EUR', bank_name: 'Santander',          iban: 'ES9121000418450200051332', swift_bic: 'BSCHESMM', purpose_code: 'CONSULTING',  screening_status: 'cleared', is_active: true })
  const beneIN = await insertBene({ tenant_id: remitx.id, user_id: maker1.id, name: 'Raj Patel',          country_code: 'IN', currency: 'INR', bank_name: 'HDFC Bank',          account_number: '50100123456789', ifsc_code: 'HDFC0001234', purpose_code: 'FAMILY',      screening_status: 'cleared', is_active: true })
  const beneAE = await insertBene({ tenant_id: remitx.id, user_id: maker1.id, name: 'Ahmad Al-Rashid',    country_code: 'AE', currency: 'AED', bank_name: 'Emirates NBD',       iban: 'AE070331234567890123456',  swift_bic: 'EBILAEAD', purpose_code: 'INVESTMENT',  screening_status: 'pending', is_active: true })

  // ── Payments ──────────────────────────────────────────────────────────────

  const h = (hours) => new Date(Date.now() - hours * 3600 * 1000)
  const d = (days)  => new Date(Date.now() - days  * 86400 * 1000)

  const insertPayment = async (data, history) => {
    const [p] = await knex('payments').insert({ quote_id: knex.raw('gen_random_uuid()'), ...data }).returning('*')
    for (const s of history) {
      await knex('payment_status_history').insert({
        tenant_id: data.tenant_id, payment_id: p.id,
        status: s.status, actor_id: s.actor_id ?? null,
        actor_type: s.actor_type ?? 'user', notes: s.notes ?? null,
        created_at: s.at ?? new Date(),
      })
    }
    return p
  }

  // pending_approval ×2 (approval queue)
  await insertPayment(
    { tenant_id: remitx.id, user_id: maker1.id, beneficiary_id: beneGB.id, account_id: usdAcc.id, source_currency: 'USD', source_amount: '5000.00', dest_currency: 'GBP', dest_amount: '3942.50', exchange_rate: '0.78850', fee_amount: '25.00', purpose_code: 'SALARY',     reference: 'RX-2026-0001', idempotency_key: 'idem-0001', provider_name: 'manual', status: 'pending_approval', note: 'Monthly salary payment' },
    [{ status: 'pending_approval', actor_id: maker1.id, at: h(2) }]
  )
  await insertPayment(
    { tenant_id: remitx.id, user_id: maker1.id, beneficiary_id: beneEU.id, account_id: usdAcc.id, source_currency: 'USD', source_amount: '10000.00', dest_currency: 'EUR', dest_amount: '9210.00', exchange_rate: '0.92100', fee_amount: '45.00', purpose_code: 'CONSULTING', reference: 'RX-2026-0002', idempotency_key: 'idem-0002', provider_name: 'manual', status: 'pending_approval', note: 'Q1 consulting invoice' },
    [{ status: 'pending_approval', actor_id: maker1.id, at: h(1) }]
  )

  // approved (checker approved, not yet sent)
  await insertPayment(
    { tenant_id: remitx.id, user_id: maker1.id, checker_id: checker1.id, beneficiary_id: beneIN.id, account_id: usdAcc.id, source_currency: 'USD', source_amount: '2000.00', dest_currency: 'INR', dest_amount: '166700.00', exchange_rate: '83.35000', fee_amount: '15.00', purpose_code: 'FAMILY', reference: 'RX-2026-0003', idempotency_key: 'idem-0003', provider_name: 'zoqq', status: 'approved' },
    [
      { status: 'pending_approval', actor_id: maker1.id,   at: h(3) },
      { status: 'approved',         actor_id: checker1.id, at: h(2), notes: 'Looks good' },
    ]
  )

  // pending_manual_processing ×2 (admin manual queue)
  await insertPayment(
    { tenant_id: remitx.id, user_id: maker1.id, checker_id: checker1.id, beneficiary_id: beneGB.id, account_id: usdAcc.id, source_currency: 'USD', source_amount: '7500.00', dest_currency: 'GBP', dest_amount: '5913.75', exchange_rate: '0.78850', fee_amount: '35.00', purpose_code: 'SALARY',     reference: 'RX-2026-0004', idempotency_key: 'idem-0004', provider_name: 'manual', status: 'pending_manual_processing' },
    [
      { status: 'pending_approval',         actor_id: maker1.id,   at: h(6) },
      { status: 'approved',                 actor_id: checker1.id, at: h(5) },
      { status: 'pending_manual_processing', actor_type: 'system', at: h(4) },
    ]
  )
  await insertPayment(
    { tenant_id: remitx.id, user_id: maker1.id, checker_id: checker2.id, beneficiary_id: beneUS.id, account_id: usdAcc.id, source_currency: 'USD', source_amount: '3000.00', dest_currency: 'USD', dest_amount: '3000.00', exchange_rate: '1.00000', fee_amount: '20.00', purpose_code: 'SERVICES',   reference: 'RX-2026-0005', idempotency_key: 'idem-0005', provider_name: 'manual', status: 'pending_manual_processing' },
    [
      { status: 'pending_approval',         actor_id: maker1.id,   at: h(4) },
      { status: 'approved',                 actor_id: checker2.id, at: h(3) },
      { status: 'pending_manual_processing', actor_type: 'system', at: h(2) },
    ]
  )

  // completed ×3
  await insertPayment(
    { tenant_id: remitx.id, user_id: maker1.id, checker_id: checker1.id, beneficiary_id: beneGB.id, account_id: usdAcc.id, source_currency: 'USD', source_amount: '4000.00', dest_currency: 'GBP', dest_amount: '3154.00', exchange_rate: '0.78850', fee_amount: '20.00', purpose_code: 'SALARY',     reference: 'RX-2026-0006', idempotency_key: 'idem-0006', provider_name: 'manual', provider_payment_id: 'PROV-78901', status: 'completed', completed_at: d(1) },
    [
      { status: 'pending_approval',         actor_id: maker1.id,   at: d(2) },
      { status: 'approved',                 actor_id: checker1.id, at: new Date(d(2).getTime() + 3600000) },
      { status: 'pending_manual_processing', actor_type: 'system', at: new Date(d(2).getTime() + 7200000) },
      { status: 'completed',                actor_type: 'system',  at: d(1) },
    ]
  )
  await insertPayment(
    { tenant_id: remitx.id, user_id: maker1.id, checker_id: checker2.id, beneficiary_id: beneEU.id, account_id: usdAcc.id, source_currency: 'USD', source_amount: '8000.00', dest_currency: 'EUR', dest_amount: '7368.00', exchange_rate: '0.92100', fee_amount: '40.00', purpose_code: 'CONSULTING', reference: 'RX-2026-0007', idempotency_key: 'idem-0007', provider_name: 'manual', provider_payment_id: 'PROV-78902', status: 'completed', completed_at: d(3) },
    [
      { status: 'pending_approval', actor_id: maker1.id,   at: d(4) },
      { status: 'approved',         actor_id: checker2.id, at: new Date(d(4).getTime() + 3600000) },
      { status: 'completed',        actor_type: 'system',  at: d(3) },
    ]
  )
  await insertPayment(
    { tenant_id: remitx.id, user_id: maker1.id, checker_id: checker1.id, beneficiary_id: beneIN.id, account_id: usdAcc.id, source_currency: 'USD', source_amount: '1000.00', dest_currency: 'INR', dest_amount: '83350.00', exchange_rate: '83.35000', fee_amount: '8.00', purpose_code: 'FAMILY', reference: 'RX-2026-0008', idempotency_key: 'idem-0008', provider_name: 'zoqq', provider_payment_id: 'ZOQQ-12345', status: 'completed', completed_at: d(5) },
    [
      { status: 'pending_approval', actor_id: maker1.id,   at: d(6) },
      { status: 'approved',         actor_id: checker1.id, at: new Date(d(6).getTime() + 3600000) },
      { status: 'completed',        actor_type: 'system',  at: d(5) },
    ]
  )

  // rejected
  await insertPayment(
    { tenant_id: remitx.id, user_id: maker1.id, checker_id: checker1.id, beneficiary_id: beneAE.id, account_id: usdAcc.id, source_currency: 'USD', source_amount: '50000.00', dest_currency: 'AED', dest_amount: '183650.00', exchange_rate: '3.67300', fee_amount: '150.00', purpose_code: 'INVESTMENT', reference: 'RX-2026-0009', idempotency_key: 'idem-0009', provider_name: 'manual', status: 'rejected' },
    [
      { status: 'pending_approval', actor_id: maker1.id,   at: d(2) },
      { status: 'rejected',         actor_id: checker1.id, at: new Date(d(2).getTime() + 7200000), notes: 'Beneficiary screening not cleared. Cannot proceed.' },
    ]
  )

  // failed
  await insertPayment(
    { tenant_id: remitx.id, user_id: maker1.id, checker_id: checker2.id, beneficiary_id: beneIN.id, account_id: usdAcc.id, source_currency: 'USD', source_amount: '1500.00', dest_currency: 'INR', dest_amount: '125025.00', exchange_rate: '83.35000', fee_amount: '12.00', purpose_code: 'FAMILY', reference: 'RX-2026-0010', idempotency_key: 'idem-0010', provider_name: 'zoqq', status: 'failed' },
    [
      { status: 'pending_approval', actor_id: maker1.id,   at: d(5) },
      { status: 'approved',         actor_id: checker2.id, at: new Date(d(5).getTime() + 3600000) },
      { status: 'failed',           actor_type: 'system',  at: new Date(d(5).getTime() + 7200000), notes: 'Provider error: Invalid IFSC code' },
    ]
  )

  // ── Ledger: debits for completed payments ─────────────────────────────────

  await knex('ledger_entries').insert([
    { tenant_id: remitx.id, account_id: usdAcc.id, entry_type: 'debit', amount: '4020.00', currency: 'USD', balance_after: '70980.00', description: 'Payment RX-2026-0006', created_at: d(1) },
    { tenant_id: remitx.id, account_id: usdAcc.id, entry_type: 'debit', amount: '8040.00', currency: 'USD', balance_after: '62940.00', description: 'Payment RX-2026-0007', created_at: d(3) },
    { tenant_id: remitx.id, account_id: usdAcc.id, entry_type: 'debit', amount: '1008.00', currency: 'USD', balance_after: '61932.00', description: 'Payment RX-2026-0008', created_at: d(5) },
    { tenant_id: remitx.id, account_id: usdAcc.id, entry_type: 'credit', amount: '20000.00', currency: 'USD', balance_after: '81932.00', description: 'Top-up deposit', created_at: d(4) },
  ])

  // ── KYC applications ──────────────────────────────────────────────────────

  await knex('kyc_applications').insert([
    {
      tenant_id: remitx.id, user_id: maker2.id, status: 'submitted',
      documents: JSON.stringify([
        { filename: 'passport.jpg',    type: 'passport',      path: '/uploads/kyc/passport.jpg' },
        { filename: 'utility_bill.pdf', type: 'address_proof', path: '/uploads/kyc/utility_bill.pdf' },
      ]),
    },
    {
      tenant_id: remitx.id, user_id: cadmin.id, status: 'approved',
      documents: JSON.stringify([{ filename: 'id_card.jpg', type: 'national_id', path: '/uploads/kyc/id_card.jpg' }]),
      reviewed_at: d(7),
    },
  ])

  // ── Notifications ─────────────────────────────────────────────────────────

  const superAdmin = await knex('users').where({ email: 'admin@remitx.com', tenant_id: remitx.id }).first()

  await knex('notifications').insert([
    // super admin — mix of read/unread
    { tenant_id: remitx.id, user_id: superAdmin.id, type: 'kyc.submitted',           title: 'New KYC application',        body: 'Bob Pending has submitted KYC documents for review.',              metadata: JSON.stringify({ user_id: maker2.id }),      read_at: null,     created_at: h(2) },
    { tenant_id: remitx.id, user_id: superAdmin.id, type: 'payment.pending_approval', title: 'Payment awaiting approval',  body: 'RX-2026-0001: USD 5,000 to John Smith awaiting checker.',          metadata: JSON.stringify({ ref: 'RX-2026-0001' }),     read_at: null,     created_at: h(2) },
    { tenant_id: remitx.id, user_id: superAdmin.id, type: 'payment.pending_approval', title: 'Payment awaiting approval',  body: 'RX-2026-0002: USD 10,000 to Maria Garcia awaiting checker.',       metadata: JSON.stringify({ ref: 'RX-2026-0002' }),     read_at: null,     created_at: h(1) },
    { tenant_id: remitx.id, user_id: superAdmin.id, type: 'payment.status_changed',   title: 'Payment completed',          body: 'RX-2026-0006 to John Smith completed successfully.',               metadata: JSON.stringify({ ref: 'RX-2026-0006' }),     read_at: d(1),     created_at: d(1) },
    { tenant_id: remitx.id, user_id: superAdmin.id, type: 'payment.status_changed',   title: 'Payment rejected',           body: 'RX-2026-0009 was rejected — beneficiary screening not cleared.',   metadata: JSON.stringify({ ref: 'RX-2026-0009' }),     read_at: d(1),     created_at: d(2) },
    // maker1
    { tenant_id: remitx.id, user_id: maker1.id,     type: 'payment.status_changed',   title: 'Payment approved',           body: 'Your payment RX-2026-0003 to Raj Patel has been approved.',        metadata: JSON.stringify({ ref: 'RX-2026-0003' }),     read_at: null,     created_at: h(2) },
    { tenant_id: remitx.id, user_id: maker1.id,     type: 'payment.status_changed',   title: 'Payment completed',          body: 'Your payment RX-2026-0006 to John Smith was processed.',           metadata: JSON.stringify({ ref: 'RX-2026-0006' }),     read_at: h(12),    created_at: d(1) },
    { tenant_id: remitx.id, user_id: maker1.id,     type: 'payment.status_changed',   title: 'Payment rejected',           body: 'Your payment RX-2026-0009 was rejected by the checker.',           metadata: JSON.stringify({ ref: 'RX-2026-0009' }),     read_at: null,     created_at: d(2) },
    // checker1
    { tenant_id: remitx.id, user_id: checker1.id,   type: 'payment.pending_approval', title: 'Payment awaiting your approval', body: 'RX-2026-0001: USD 5,000 is waiting for your approval.',       metadata: JSON.stringify({ ref: 'RX-2026-0001' }),     read_at: null,     created_at: h(2) },
    { tenant_id: remitx.id, user_id: checker1.id,   type: 'payment.pending_approval', title: 'Payment awaiting your approval', body: 'RX-2026-0002: USD 10,000 is waiting for your approval.',      metadata: JSON.stringify({ ref: 'RX-2026-0002' }),     read_at: null,     created_at: h(1) },
  ])

  // ── Reconciliation reports (last 7 days) ──────────────────────────────────

  const reportsData = Array.from({ length: 7 }, (_, i) => {
    const dt = new Date(); dt.setDate(dt.getDate() - (i + 1))
    const dateStr = dt.toISOString().split('T')[0]
    const hasExceptions = i === 2
    const total = 10 + i * 3
    const unmatched = hasExceptions ? 2 : 0
    return {
      tenant_id: remitx.id,
      report_date: dateStr,
      total_payments: total,
      total_amount: ((total * 3200) + i * 1000).toFixed(2),
      matched_count: total - unmatched,
      unmatched_count: unmatched,
      exceptions: JSON.stringify(hasExceptions ? [
        { payment_id: 'RX-2026-XXXX', reason: 'Amount mismatch', diff: '12.50' },
        { payment_id: 'RX-2026-YYYY', reason: 'Missing provider reference' },
      ] : []),
      status: hasExceptions ? 'exceptions' : 'matched',
    }
  })
  await knex('reconciliation_reports').insert(reportsData)

  // ── Provider corridor configs ──────────────────────────────────────────────

  await knex('provider_corridor_configs')
    .insert([
      { tenant_id: remitx.id, source_currency: 'USD', dest_currency: 'GBP', provider_name: 'manual',        priority: 1,  is_active: true },
      { tenant_id: remitx.id, source_currency: 'USD', dest_currency: 'EUR', provider_name: 'manual',        priority: 1,  is_active: true },
      { tenant_id: remitx.id, source_currency: 'USD', dest_currency: 'INR', provider_name: 'zoqq',          priority: 1,  is_active: true },
      { tenant_id: remitx.id, source_currency: 'USD', dest_currency: 'AED', provider_name: 'manual',        priority: 1,  is_active: true },
      { tenant_id: remitx.id, source_currency: 'GBP', dest_currency: 'USD', provider_name: 'cloudcurrency', priority: 1,  is_active: true },
      { tenant_id: remitx.id, source_currency: 'EUR', dest_currency: 'USD', provider_name: 'cloudcurrency', priority: 1,  is_active: true },
      { tenant_id: remitx.id, source_currency: 'USD', dest_currency: null,  provider_name: 'manual',        priority: 99, is_active: true },
    ])
    .onConflict(['tenant_id', 'source_currency', 'dest_currency'])
    .ignore()

  console.log('\n[seed] ✓ Test data seeded')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('  TENANT     SLUG                    STATUS')
  console.log('  RemitX     remitx                  active  (default)')
  console.log('  Acme Corp  acme-corp               active  (second tenant)')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('  EMAIL                  PASSWORD         ROLE          KYC       STATUS')
  console.log('  admin@remitx.com       Admin@RemitX2024! super_admin  approved  active')
  console.log('  cadmin@remitx.com      Test@1234!        client_admin approved  active')
  console.log('  maker1@remitx.com      Test@1234!        maker        approved  active')
  console.log('  maker2@remitx.com      Test@1234!        maker        submitted active (KYC queue)')
  console.log('  checker1@remitx.com    Test@1234!        checker      approved  active')
  console.log('  checker2@remitx.com    Test@1234!        checker      approved  active')
  console.log('  inactive@remitx.com    Test@1234!        maker        pending   inactive')
  console.log('  suspended@remitx.com   Test@1234!        maker        approved  suspended')
  console.log('  admin@acme.com         Test@1234!        client_admin approved  active (acme)')
  console.log('  maker@acme.com         Test@1234!        maker        approved  active (acme)')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('  Payments: 2 pending_approval | 1 approved | 2 manual queue | 3 completed | 1 rejected | 1 failed')
  console.log('  KYC queue: 1 submitted (maker2)')
  console.log('  Reconciliation: 7 days (1 has exceptions)')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
}
