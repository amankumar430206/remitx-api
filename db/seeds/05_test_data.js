import bcrypt from 'bcrypt'

// ─── Investor-demo seed ───────────────────────────────────────────────────────
// Every page has rich, realistic data covering all statuses and edge cases.
// Idempotent: skips if maker1@remitx.com already exists.
// ─────────────────────────────────────────────────────────────────────────────

const PASSWORD = 'Test@1234!'

export const seed = async (knex) => {
  const existing = await knex('users').where({ email: 'maker1@remitx.com' }).first()
  if (existing) { console.log('[seed] Test data already exists — skipping'); return }

  const pwdHash = await bcrypt.hash(PASSWORD, 12)

  // ── Time helpers ──────────────────────────────────────────────────────────
  const h  = (hrs)  => new Date(Date.now() - hrs  * 3_600_000)
  const d  = (days) => new Date(Date.now() - days * 86_400_000)
  const at = (days, extraMs = 0) => new Date(d(days).getTime() + extraMs)

  // ── Reference counter ─────────────────────────────────────────────────────
  let _ref = 0
  const next = () => {
    _ref++
    const n = String(_ref).padStart(4, '0')
    return { ref: `RX-2026-${n}`, ikey: `idem-${n}` }
  }

  // ── Insert helpers ────────────────────────────────────────────────────────
  const insertUser = async (data) => {
    const [u] = await knex('users').insert({ password_hash: pwdHash, ...data }).returning('*')
    await knex('user_password_history').insert({ user_id: u.id, password_hash: pwdHash })
    return u
  }

  const insertBene = async (data) => {
    const [b] = await knex('beneficiaries').insert(data).returning('*')
    return b
  }

  const insertAccount = async (data) => {
    const [a] = await knex('accounts').insert(data).returning('*')
    return a
  }

  const insertPayment = async (base, history) => {
    const [p] = await knex('payments')
      .insert({ quote_id: knex.raw('gen_random_uuid()'), ...base })
      .returning('*')
    for (const s of history) {
      await knex('payment_status_history').insert({
        tenant_id: base.tenant_id, payment_id: p.id,
        status: s.status, actor_id: s.actor_id ?? null,
        actor_type: s.actor_type ?? 'user', notes: s.notes ?? null,
        created_at: s.at ?? new Date(),
      })
    }
    return p
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 1.  TENANTS
  // ═══════════════════════════════════════════════════════════════════════════

  const remitx = await knex('tenants').where({ slug: 'remitx' }).first()

  const [[acme], [globalpay], [sterling], [paybridge], [fintechv]] = await Promise.all([
    knex('tenants').insert({ slug: 'acme-corp',         name: 'Acme Corp',          status: 'active',    created_at: d(180) }).returning('*'),
    knex('tenants').insert({ slug: 'globalpay',         name: 'GlobalPay Ltd',      status: 'active',    created_at: d(120) }).returning('*'),
    knex('tenants').insert({ slug: 'sterling-money',    name: 'Sterling Money',     status: 'suspended', created_at: d(90)  }).returning('*'),
    knex('tenants').insert({ slug: 'paybridge',         name: 'PayBridge Inc',      status: 'inactive',  created_at: d(60)  }).returning('*'),
    knex('tenants').insert({ slug: 'fintech-ventures',  name: 'FinTech Ventures',   status: 'pending',   created_at: d(14)  }).returning('*'),
  ])

  await knex('tenant_theme_configs').insert([
    { tenant_id: acme.id,      primary_color: '#e11d48', secondary_color: '#0ea5e9', company_name: 'Acme Corp',        font_family: 'Inter', webhook_enabled: false },
    { tenant_id: globalpay.id, primary_color: '#0ea5e9', secondary_color: '#6366f1', company_name: 'GlobalPay Ltd',    font_family: 'Inter', webhook_enabled: true  },
    { tenant_id: sterling.id,  primary_color: '#1d4ed8', secondary_color: '#7c3aed', company_name: 'Sterling Money',   font_family: 'Inter', webhook_enabled: false },
    { tenant_id: paybridge.id, primary_color: '#059669', secondary_color: '#d97706', company_name: 'PayBridge Inc',    font_family: 'Inter', webhook_enabled: false },
    { tenant_id: fintechv.id,  primary_color: '#7c3aed', secondary_color: '#ec4899', company_name: 'FinTech Ventures', font_family: 'Inter', webhook_enabled: false },
  ])

  // ═══════════════════════════════════════════════════════════════════════════
  // 2.  USERS
  // ═══════════════════════════════════════════════════════════════════════════

  // remitx tenant
  const cadmin   = await insertUser({ tenant_id: remitx.id, email: 'cadmin@remitx.com',    first_name: 'Claire',   last_name: 'Harrington', role: 'client_admin', kyc_status: 'approved',  status: 'active'    })
  const maker1   = await insertUser({ tenant_id: remitx.id, email: 'maker1@remitx.com',    first_name: 'Alice',    last_name: 'Thornton',   role: 'maker',        kyc_status: 'approved',  status: 'active'    })
  const maker2   = await insertUser({ tenant_id: remitx.id, email: 'maker2@remitx.com',    first_name: 'Bob',      last_name: 'Nakamura',   role: 'maker',        kyc_status: 'submitted', status: 'active'    })
  const maker3   = await insertUser({ tenant_id: remitx.id, email: 'maker3@remitx.com',    first_name: 'Carlos',   last_name: 'Rivera',     role: 'maker',        kyc_status: 'approved',  status: 'active'    })
  const checker1 = await insertUser({ tenant_id: remitx.id, email: 'checker1@remitx.com',  first_name: 'Carol',    last_name: 'Sinclair',   role: 'checker',      kyc_status: 'approved',  status: 'active'    })
  const checker2 = await insertUser({ tenant_id: remitx.id, email: 'checker2@remitx.com',  first_name: 'David',    last_name: 'Park',       role: 'checker',      kyc_status: 'approved',  status: 'active'    })
  const kycUser3 = await insertUser({ tenant_id: remitx.id, email: 'kyc3@remitx.com',      first_name: 'Elena',    last_name: 'Kowalski',   role: 'maker',        kyc_status: 'submitted', status: 'active'    })
  const kycUser4 = await insertUser({ tenant_id: remitx.id, email: 'kyc4@remitx.com',      first_name: 'Thomas',   last_name: 'Okonkwo',    role: 'maker',        kyc_status: 'submitted', status: 'active'    })
  await insertUser({                  tenant_id: remitx.id, email: 'inactive@remitx.com',  first_name: 'Inactive', last_name: 'User',       role: 'maker',        kyc_status: 'pending',   status: 'inactive'  })
  await insertUser({                  tenant_id: remitx.id, email: 'suspended@remitx.com', first_name: 'Sam',      last_name: 'Dupont',     role: 'maker',        kyc_status: 'approved',  status: 'suspended' })

  // acme tenant
  await insertUser({ tenant_id: acme.id,      email: 'admin@acme.com',      first_name: 'Acme',   last_name: 'Admin',   role: 'client_admin', kyc_status: 'approved', status: 'active' })
  const acmeMaker   = await insertUser({ tenant_id: acme.id,      email: 'maker@acme.com',      first_name: 'Acme',   last_name: 'Maker',   role: 'maker',        kyc_status: 'approved', status: 'active' })
  await insertUser({ tenant_id: acme.id,      email: 'checker@acme.com',    first_name: 'Acme',   last_name: 'Checker', role: 'checker',      kyc_status: 'approved', status: 'active' })

  // globalpay tenant
  await insertUser({ tenant_id: globalpay.id, email: 'admin@globalpay.com', first_name: 'James',  last_name: 'Hartley', role: 'client_admin', kyc_status: 'approved', status: 'active' })
  const gpMaker = await insertUser({ tenant_id: globalpay.id, email: 'maker@globalpay.com', first_name: 'Priya',  last_name: 'Mehta',   role: 'maker',        kyc_status: 'approved', status: 'active' })

  // sterling + paybridge + fintechv admins only
  await insertUser({ tenant_id: sterling.id,  email: 'admin@sterling.com',  first_name: 'Marcus', last_name: 'Sterling', role: 'client_admin', kyc_status: 'approved', status: 'active' })
  await insertUser({ tenant_id: paybridge.id, email: 'admin@paybridge.com', first_name: 'Lena',   last_name: 'Bridge',   role: 'client_admin', kyc_status: 'approved', status: 'active' })
  await insertUser({ tenant_id: fintechv.id,  email: 'admin@fintechv.com',  first_name: 'Ryan',   last_name: 'Ventura',  role: 'client_admin', kyc_status: 'pending',  status: 'active' })

  const superAdmin = await knex('users').where({ email: 'admin@remitx.com', tenant_id: remitx.id }).first()

  // ═══════════════════════════════════════════════════════════════════════════
  // 3.  ACCOUNTS
  // ═══════════════════════════════════════════════════════════════════════════

  const usdAcc  = await insertAccount({ tenant_id: remitx.id,   user_id: cadmin.id,   currency: 'USD', account_number: 'RX-USD-001', provider_name: 'manual', status: 'active' })
  const gbpAcc  = await insertAccount({ tenant_id: remitx.id,   user_id: maker1.id,   currency: 'GBP', account_number: 'RX-GBP-001', provider_name: 'manual', status: 'active' })
  const eurAcc  = await insertAccount({ tenant_id: remitx.id,   user_id: maker1.id,   currency: 'EUR', account_number: 'RX-EUR-001', provider_name: 'manual', status: 'active' })
  const aedAcc  = await insertAccount({ tenant_id: remitx.id,   user_id: maker3.id,   currency: 'AED', account_number: 'RX-AED-001', provider_name: 'manual', status: 'active' })
  const acmeAcc = await insertAccount({ tenant_id: acme.id,     user_id: acmeMaker.id,currency: 'USD', account_number: 'AC-USD-001', provider_name: 'manual', status: 'active' })
  const gpAcc   = await insertAccount({ tenant_id: globalpay.id,user_id: gpMaker.id,  currency: 'USD', account_number: 'GP-USD-001', provider_name: 'manual', status: 'active' })

  // ═══════════════════════════════════════════════════════════════════════════
  // 4.  LEDGER — opening balances
  // ═══════════════════════════════════════════════════════════════════════════

  // We track usdBal precisely; GBP/EUR/AED are receive-only in this demo
  let usdBal = 1_200_000.00

  await knex('ledger_entries').insert([
    { tenant_id: remitx.id,   account_id: usdAcc.id,  entry_type: 'credit', amount: '1200000.00', currency: 'USD', balance_after: '1200000.00', description: 'Initial capitalisation',         created_at: d(120) },
    { tenant_id: remitx.id,   account_id: gbpAcc.id,  entry_type: 'credit', amount:  '150000.00', currency: 'GBP', balance_after:  '150000.00', description: 'Initial capitalisation',         created_at: d(120) },
    { tenant_id: remitx.id,   account_id: eurAcc.id,  entry_type: 'credit', amount:  '250000.00', currency: 'EUR', balance_after:  '250000.00', description: 'Initial capitalisation',         created_at: d(120) },
    { tenant_id: remitx.id,   account_id: aedAcc.id,  entry_type: 'credit', amount:  '750000.00', currency: 'AED', balance_after:  '750000.00', description: 'Initial capitalisation',         created_at: d(120) },
    { tenant_id: acme.id,     account_id: acmeAcc.id, entry_type: 'credit', amount:  '250000.00', currency: 'USD', balance_after:  '250000.00', description: 'Initial capitalisation',         created_at: d(180) },
    { tenant_id: globalpay.id,account_id: gpAcc.id,   entry_type: 'credit', amount:  '500000.00', currency: 'USD', balance_after:  '500000.00', description: 'Initial capitalisation',         created_at: d(120) },
    // Periodic top-ups for remitx USD
    { tenant_id: remitx.id,   account_id: usdAcc.id,  entry_type: 'credit', amount:  '500000.00', currency: 'USD', balance_after: '1700000.00', description: 'Q1 capitalisation top-up',       created_at: d(60)  },
    { tenant_id: remitx.id,   account_id: usdAcc.id,  entry_type: 'credit', amount:  '300000.00', currency: 'USD', balance_after: '2000000.00', description: 'Q2 capitalisation top-up',       created_at: d(30)  },
  ])

  // ═══════════════════════════════════════════════════════════════════════════
  // 5.  BENEFICIARIES
  // ═══════════════════════════════════════════════════════════════════════════

  const beneGB   = await insertBene({ tenant_id: remitx.id, user_id: maker1.id, name: 'John Smith',          country_code: 'GB', currency: 'GBP', bank_name: 'Barclays Bank',     account_number: '12345678',          sort_code: '20-00-00',   purpose_code: 'SALARY',     screening_status: 'cleared', is_active: true })
  const beneUS   = await insertBene({ tenant_id: remitx.id, user_id: maker1.id, name: 'Tech Solutions LLC',  country_code: 'US', currency: 'USD', bank_name: 'JPMorgan Chase',    account_number: '987654321',         routing_number: '021000021', purpose_code: 'SERVICES', screening_status: 'cleared', is_active: true })
  const beneEU   = await insertBene({ tenant_id: remitx.id, user_id: maker1.id, name: 'Maria Garcia Ruiz',   country_code: 'ES', currency: 'EUR', bank_name: 'Banco Santander',   iban: 'ES9121000418450200051332',     swift_bic: 'BSCHESMM',   purpose_code: 'CONSULTING', screening_status: 'cleared', is_active: true })
  const beneIN   = await insertBene({ tenant_id: remitx.id, user_id: maker1.id, name: 'Raj Patel',           country_code: 'IN', currency: 'INR', bank_name: 'HDFC Bank',         account_number: '50100123456789',    ifsc_code: 'HDFC0001234', purpose_code: 'FAMILY',    screening_status: 'cleared', is_active: true })
  const beneAE   = await insertBene({ tenant_id: remitx.id, user_id: maker1.id, name: 'Ahmad Al-Rashid',     country_code: 'AE', currency: 'AED', bank_name: 'Emirates NBD',      iban: 'AE070331234567890123456',      swift_bic: 'EBILAEAD',   purpose_code: 'SERVICES',   screening_status: 'cleared', is_active: true })
  const beneFR   = await insertBene({ tenant_id: remitx.id, user_id: maker1.id, name: 'Sophie Dubois',       country_code: 'FR', currency: 'EUR', bank_name: 'BNP Paribas',       iban: 'FR7630006000011234567890189',  swift_bic: 'BNPAFRPP',   purpose_code: 'CONSULTING', screening_status: 'cleared', is_active: true })
  const beneDE   = await insertBene({ tenant_id: remitx.id, user_id: maker3.id, name: 'Klaus Hoffmann',      country_code: 'DE', currency: 'EUR', bank_name: 'Deutsche Bank',     iban: 'DE89370400440532013000',       swift_bic: 'DEUTDEFF',   purpose_code: 'CONSULTING', screening_status: 'cleared', is_active: true })
  const beneSG   = await insertBene({ tenant_id: remitx.id, user_id: maker3.id, name: 'Lim Wei Xiong',       country_code: 'SG', currency: 'SGD', bank_name: 'DBS Bank',          account_number: '0720123456',         swift_bic: 'DBSSSGSG',   purpose_code: 'SERVICES',   screening_status: 'cleared', is_active: true })
  const beneMX   = await insertBene({ tenant_id: remitx.id, user_id: maker3.id, name: 'Diego Hernández',     country_code: 'MX', currency: 'MXN', bank_name: 'BBVA México',       account_number: '012180015407949407', swift_bic: 'BCMRMXMM',   purpose_code: 'SERVICES',   screening_status: 'cleared', is_active: true })
  // Pending screening (AML in progress)
  const beneNG   = await insertBene({ tenant_id: remitx.id, user_id: maker3.id, name: 'Emeka Okafor',        country_code: 'NG', currency: 'NGN', bank_name: 'GTBank Nigeria',     account_number: '0123456789',         swift_bic: 'GTBINGLA',   purpose_code: 'FAMILY',     screening_status: 'pending', is_active: true })
  const benePK   = await insertBene({ tenant_id: remitx.id, user_id: maker3.id, name: 'Muhammad Tariq',      country_code: 'PK', currency: 'PKR', bank_name: 'HBL Bank Pakistan',  account_number: '04131234567890',     swift_bic: 'HABBPKKA',   purpose_code: 'FAMILY',     screening_status: 'pending', is_active: true })
  // Flagged (compliance hold)
  const beneRU   = await insertBene({ tenant_id: remitx.id, user_id: maker1.id, name: 'Viktor Volkov',       country_code: 'RU', currency: 'USD', bank_name: 'Sberbank Russia',    account_number: '40817810099910004312', swift_bic: 'SABRRUMM', purpose_code: 'INVESTMENT', screening_status: 'flagged',  is_active: true })

  // acme beneficiary
  await insertBene({ tenant_id: acme.id, user_id: acmeMaker.id, name: 'Acme Supplier Ltd', country_code: 'GB', currency: 'GBP', bank_name: 'HSBC UK', account_number: '99887766', sort_code: '40-47-84', purpose_code: 'SERVICES', screening_status: 'cleared', is_active: true })

  // ═══════════════════════════════════════════════════════════════════════════
  // 6.  PAYMENTS
  // ═══════════════════════════════════════════════════════════════════════════

  // Helper to build a full completed-payment + ledger debit
  const addCompleted = async ({ maker, checker, bene, srcAmt, dst, dstAmt, rate, fee, purpose, createdDaysAgo, note }) => {
    const debit  = Math.round((parseFloat(srcAmt) + parseFloat(fee)) * 100) / 100
    usdBal       = Math.round((usdBal - debit) * 100) / 100
    const { ref, ikey } = next()
    const created = d(createdDaysAgo)
    const approved = new Date(created.getTime() + 3_600_000 * 2)
    const dispatched = new Date(created.getTime() + 3_600_000 * 5)
    const completed = new Date(created.getTime() + 3_600_000 * 24)

    const p = await insertPayment({
      tenant_id: remitx.id, user_id: maker.id, checker_id: checker.id,
      beneficiary_id: bene.id, account_id: usdAcc.id,
      source_currency: 'USD', source_amount: srcAmt,
      dest_currency: dst, dest_amount: dstAmt, exchange_rate: rate, fee_amount: fee,
      purpose_code: purpose, reference: ref, idempotency_key: ikey,
      provider_name: 'manual', provider_payment_id: `PROV-${ref}`,
      status: 'completed', completed_at: completed, note: note ?? null,
      created_at: created,
    }, [
      { status: 'pending_approval',          actor_id: maker.id,   at: created },
      { status: 'approved',                  actor_id: checker.id, at: approved, notes: 'Verified and approved' },
      { status: 'pending_manual_processing', actor_type: 'system', at: dispatched },
      { status: 'completed',                 actor_type: 'system', at: completed },
    ])

    await knex('ledger_entries').insert({
      tenant_id: remitx.id, account_id: usdAcc.id,
      entry_type: 'debit', amount: debit.toFixed(2), currency: 'USD',
      balance_after: usdBal.toFixed(2),
      description: `Payment ${ref}`, created_at: completed,
    })
    return p
  }

  // ── 6A. COMPLETED — Days 90→31 (month 1 history) ─────────────────────────
  await addCompleted({ maker: maker1, checker: checker1, bene: beneGB,  srcAmt: '3500.00', dst: 'GBP', dstAmt: '2759.75',   rate: '0.78850', fee: '17.50', purpose: 'SALARY',     createdDaysAgo: 89 })
  await addCompleted({ maker: maker1, checker: checker2, bene: beneEU,  srcAmt: '5200.00', dst: 'EUR', dstAmt: '4789.20',   rate: '0.92100', fee: '26.00', purpose: 'CONSULTING', createdDaysAgo: 87 })
  await addCompleted({ maker: maker3, checker: checker1, bene: beneIN,  srcAmt: '1200.00', dst: 'INR', dstAmt: '100020.00', rate: '83.35000',fee: '9.60',  purpose: 'FAMILY',     createdDaysAgo: 85 })
  await addCompleted({ maker: maker1, checker: checker2, bene: beneAE,  srcAmt: '8000.00', dst: 'AED', dstAmt: '29384.00',  rate: '3.67300', fee: '40.00', purpose: 'SERVICES',   createdDaysAgo: 83 })
  await addCompleted({ maker: maker3, checker: checker1, bene: beneSG,  srcAmt: '4500.00', dst: 'SGD', dstAmt: '6052.50',   rate: '1.34500', fee: '22.50', purpose: 'SERVICES',   createdDaysAgo: 81 })
  await addCompleted({ maker: maker1, checker: checker1, bene: beneGB,  srcAmt: '6000.00', dst: 'GBP', dstAmt: '4731.00',   rate: '0.78850', fee: '30.00', purpose: 'SALARY',     createdDaysAgo: 78 })
  await addCompleted({ maker: maker1, checker: checker2, bene: beneFR,  srcAmt: '7500.00', dst: 'EUR', dstAmt: '6907.50',   rate: '0.92100', fee: '37.50', purpose: 'CONSULTING', createdDaysAgo: 76 })
  await addCompleted({ maker: maker3, checker: checker1, bene: beneDE,  srcAmt: '9200.00', dst: 'EUR', dstAmt: '8473.20',   rate: '0.92100', fee: '46.00', purpose: 'CONSULTING', createdDaysAgo: 74 })
  await addCompleted({ maker: maker1, checker: checker2, bene: beneUS,  srcAmt: '3800.00', dst: 'USD', dstAmt: '3800.00',   rate: '1.00000', fee: '19.00', purpose: 'SERVICES',   createdDaysAgo: 71 })
  await addCompleted({ maker: maker3, checker: checker1, bene: beneMX,  srcAmt: '2200.00', dst: 'MXN', dstAmt: '37400.00',  rate: '17.00000',fee: '11.00', purpose: 'SERVICES',   createdDaysAgo: 68 })
  await addCompleted({ maker: maker1, checker: checker1, bene: beneIN,  srcAmt: '1800.00', dst: 'INR', dstAmt: '150030.00', rate: '83.35000',fee: '14.40', purpose: 'FAMILY',     createdDaysAgo: 65 })
  await addCompleted({ maker: maker1, checker: checker2, bene: beneAE,  srcAmt: '12000.00',dst: 'AED', dstAmt: '44076.00',  rate: '3.67300', fee: '60.00', purpose: 'INVESTMENT', createdDaysAgo: 63 })
  await addCompleted({ maker: maker3, checker: checker1, bene: beneGB,  srcAmt: '4200.00', dst: 'GBP', dstAmt: '3311.70',   rate: '0.78850', fee: '21.00', purpose: 'SALARY',     createdDaysAgo: 60 })
  await addCompleted({ maker: maker1, checker: checker2, bene: beneEU,  srcAmt: '6800.00', dst: 'EUR', dstAmt: '6262.80',   rate: '0.92100', fee: '34.00', purpose: 'CONSULTING', createdDaysAgo: 57 })
  await addCompleted({ maker: maker3, checker: checker1, bene: beneSG,  srcAmt: '5100.00', dst: 'SGD', dstAmt: '6859.50',   rate: '1.34500', fee: '25.50', purpose: 'SERVICES',   createdDaysAgo: 55 })

  // ── 6B. COMPLETED — Days 30→8 (month 2 — denser activity) ───────────────
  await addCompleted({ maker: maker1, checker: checker1, bene: beneGB,  srcAmt: '7000.00', dst: 'GBP', dstAmt: '5519.50',   rate: '0.78850', fee: '35.00', purpose: 'SALARY',     createdDaysAgo: 52 })
  await addCompleted({ maker: maker3, checker: checker2, bene: beneFR,  srcAmt: '11000.00',dst: 'EUR', dstAmt: '10131.00',  rate: '0.92100', fee: '55.00', purpose: 'CONSULTING', createdDaysAgo: 49 })
  await addCompleted({ maker: maker1, checker: checker1, bene: beneIN,  srcAmt: '2500.00', dst: 'INR', dstAmt: '208375.00', rate: '83.35000',fee: '20.00', purpose: 'FAMILY',     createdDaysAgo: 46 })
  await addCompleted({ maker: maker3, checker: checker2, bene: beneAE,  srcAmt: '15000.00',dst: 'AED', dstAmt: '55095.00',  rate: '3.67300', fee: '75.00', purpose: 'SERVICES',   createdDaysAgo: 44 })
  await addCompleted({ maker: maker1, checker: checker1, bene: beneDE,  srcAmt: '8500.00', dst: 'EUR', dstAmt: '7828.50',   rate: '0.92100', fee: '42.50', purpose: 'CONSULTING', createdDaysAgo: 41 })
  await addCompleted({ maker: maker3, checker: checker2, bene: beneUS,  srcAmt: '6200.00', dst: 'USD', dstAmt: '6200.00',   rate: '1.00000', fee: '31.00', purpose: 'SERVICES',   createdDaysAgo: 38 })
  await addCompleted({ maker: maker1, checker: checker1, bene: beneGB,  srcAmt: '9000.00', dst: 'GBP', dstAmt: '7096.50',   rate: '0.78850', fee: '45.00', purpose: 'SALARY',     createdDaysAgo: 36 })
  await addCompleted({ maker: maker3, checker: checker2, bene: beneMX,  srcAmt: '3400.00', dst: 'MXN', dstAmt: '57800.00',  rate: '17.00000',fee: '17.00', purpose: 'SERVICES',   createdDaysAgo: 33 })
  await addCompleted({ maker: maker1, checker: checker1, bene: beneEU,  srcAmt: '14000.00',dst: 'EUR', dstAmt: '12894.00',  rate: '0.92100', fee: '70.00', purpose: 'CONSULTING', createdDaysAgo: 30 })
  await addCompleted({ maker: maker3, checker: checker2, bene: beneSG,  srcAmt: '7800.00', dst: 'SGD', dstAmt: '10491.00',  rate: '1.34500', fee: '39.00', purpose: 'SERVICES',   createdDaysAgo: 27 })

  // ── 6C. COMPLETED — Days 7→2 (recent week, high visibility) ─────────────
  await addCompleted({ maker: maker1, checker: checker1, bene: beneGB,  srcAmt: '5000.00', dst: 'GBP', dstAmt: '3942.50',   rate: '0.78850', fee: '25.00', purpose: 'SALARY',     createdDaysAgo: 25, note: 'May salary payment' })
  await addCompleted({ maker: maker3, checker: checker2, bene: beneAE,  srcAmt: '22000.00',dst: 'AED', dstAmt: '80806.00',  rate: '3.67300', fee: '110.00',purpose: 'INVESTMENT', createdDaysAgo: 22 })
  await addCompleted({ maker: maker1, checker: checker1, bene: beneFR,  srcAmt: '9500.00', dst: 'EUR', dstAmt: '8749.50',   rate: '0.92100', fee: '47.50', purpose: 'CONSULTING', createdDaysAgo: 18 })
  await addCompleted({ maker: maker3, checker: checker2, bene: beneIN,  srcAmt: '3000.00', dst: 'INR', dstAmt: '250050.00', rate: '83.35000',fee: '24.00', purpose: 'FAMILY',     createdDaysAgo: 15 })
  await addCompleted({ maker: maker1, checker: checker1, bene: beneDE,  srcAmt: '18000.00',dst: 'EUR', dstAmt: '16578.00',  rate: '0.92100', fee: '90.00', purpose: 'CONSULTING', createdDaysAgo: 12 })
  await addCompleted({ maker: maker3, checker: checker2, bene: beneGB,  srcAmt: '6500.00', dst: 'GBP', dstAmt: '5125.25',   rate: '0.78850', fee: '32.50', purpose: 'SALARY',     createdDaysAgo: 9  })
  await addCompleted({ maker: maker1, checker: checker1, bene: beneEU,  srcAmt: '11500.00',dst: 'EUR', dstAmt: '10591.50',  rate: '0.92100', fee: '57.50', purpose: 'CONSULTING', createdDaysAgo: 7  })
  await addCompleted({ maker: maker3, checker: checker2, bene: beneUS,  srcAmt: '4700.00', dst: 'USD', dstAmt: '4700.00',   rate: '1.00000', fee: '23.50', purpose: 'SERVICES',   createdDaysAgo: 5  })
  await addCompleted({ maker: maker1, checker: checker2, bene: beneAE,  srcAmt: '28000.00',dst: 'AED', dstAmt: '102844.00', rate: '3.67300', fee: '140.00',purpose: 'INVESTMENT', createdDaysAgo: 3, note: 'Q2 investment tranche' })
  await addCompleted({ maker: maker3, checker: checker1, bene: beneSG,  srcAmt: '8800.00', dst: 'SGD', dstAmt: '11836.00',  rate: '1.34500', fee: '44.00', purpose: 'SERVICES',   createdDaysAgo: 2  })

  // ── 6D. REJECTED (compliance / checker decisions) ────────────────────────
  const r1 = next()
  await insertPayment({
    tenant_id: remitx.id, user_id: maker1.id, checker_id: checker1.id,
    beneficiary_id: beneRU.id, account_id: usdAcc.id,
    source_currency: 'USD', source_amount: '75000.00', dest_currency: 'USD', dest_amount: '75000.00',
    exchange_rate: '1.00000', fee_amount: '250.00', purpose_code: 'INVESTMENT',
    reference: r1.ref, idempotency_key: r1.ikey, provider_name: 'manual', status: 'rejected',
    note: 'High-value transfer to newly added beneficiary', created_at: d(71),
  }, [
    { status: 'pending_approval', actor_id: maker1.id,   at: d(71) },
    { status: 'rejected',         actor_id: checker1.id, at: at(71, 7_200_000), notes: 'Beneficiary flagged by compliance screening. Transfer blocked.' },
  ])

  const r2 = next()
  await insertPayment({
    tenant_id: remitx.id, user_id: maker3.id, checker_id: checker2.id,
    beneficiary_id: beneNG.id, account_id: usdAcc.id,
    source_currency: 'USD', source_amount: '4500.00', dest_currency: 'NGN', dest_amount: '6750000.00',
    exchange_rate: '1500.00000', fee_amount: '22.50', purpose_code: 'FAMILY',
    reference: r2.ref, idempotency_key: r2.ikey, provider_name: 'manual', status: 'rejected',
    note: 'Family remittance', created_at: d(40),
  }, [
    { status: 'pending_approval', actor_id: maker3.id,   at: d(40) },
    { status: 'rejected',         actor_id: checker2.id, at: at(40, 3_600_000), notes: 'Beneficiary screening still pending. Resubmit once AML cleared.' },
  ])

  const r3 = next()
  await insertPayment({
    tenant_id: remitx.id, user_id: maker1.id, checker_id: checker1.id,
    beneficiary_id: beneAE.id, account_id: usdAcc.id,
    source_currency: 'USD', source_amount: '120000.00', dest_currency: 'AED', dest_amount: '440760.00',
    exchange_rate: '3.67300', fee_amount: '400.00', purpose_code: 'INVESTMENT',
    reference: r3.ref, idempotency_key: r3.ikey, provider_name: 'manual', status: 'rejected',
    note: 'Bulk investment transfer', created_at: d(18),
  }, [
    { status: 'pending_approval', actor_id: maker1.id,   at: d(18) },
    { status: 'rejected',         actor_id: checker1.id, at: at(18, 14_400_000), notes: 'Amount exceeds single-transaction limit for this corridor. Split required.' },
  ])

  const r4 = next()
  await insertPayment({
    tenant_id: remitx.id, user_id: maker3.id, checker_id: checker2.id,
    beneficiary_id: benePK.id, account_id: usdAcc.id,
    source_currency: 'USD', source_amount: '2800.00', dest_currency: 'PKR', dest_amount: '784000.00',
    exchange_rate: '280.00000', fee_amount: '14.00', purpose_code: 'FAMILY',
    reference: r4.ref, idempotency_key: r4.ikey, provider_name: 'manual', status: 'rejected',
    note: 'Pending AML clearance on beneficiary', created_at: d(8),
  }, [
    { status: 'pending_approval', actor_id: maker3.id,   at: d(8) },
    { status: 'rejected',         actor_id: checker2.id, at: at(8, 1_800_000), notes: 'Beneficiary KYC screening not complete. Cannot process to pending corridor.' },
  ])

  // ── 6E. FAILED (provider / technical errors) ─────────────────────────────
  const f1 = next()
  await insertPayment({
    tenant_id: remitx.id, user_id: maker1.id, checker_id: checker1.id,
    beneficiary_id: beneIN.id, account_id: usdAcc.id,
    source_currency: 'USD', source_amount: '1600.00', dest_currency: 'INR', dest_amount: '133360.00',
    exchange_rate: '83.35000', fee_amount: '12.80', purpose_code: 'FAMILY',
    reference: f1.ref, idempotency_key: f1.ikey, provider_name: 'manual', status: 'failed', created_at: d(50),
  }, [
    { status: 'pending_approval',          actor_id: maker1.id,   at: d(50) },
    { status: 'approved',                  actor_id: checker1.id, at: at(50, 3_600_000) },
    { status: 'pending_manual_processing', actor_type: 'system',  at: at(50, 7_200_000) },
    { status: 'failed',                    actor_type: 'system',  at: at(50, 86_400_000), notes: 'Provider error: Invalid IFSC code. Please update beneficiary details.' },
  ])

  const f2 = next()
  await insertPayment({
    tenant_id: remitx.id, user_id: maker3.id, checker_id: checker2.id,
    beneficiary_id: beneSG.id, account_id: usdAcc.id,
    source_currency: 'USD', source_amount: '3200.00', dest_currency: 'SGD', dest_amount: '4304.00',
    exchange_rate: '1.34500', fee_amount: '16.00', purpose_code: 'SERVICES',
    reference: f2.ref, idempotency_key: f2.ikey, provider_name: 'manual', status: 'failed', created_at: d(28),
  }, [
    { status: 'pending_approval',          actor_id: maker3.id,   at: d(28) },
    { status: 'approved',                  actor_id: checker2.id, at: at(28, 2_700_000) },
    { status: 'pending_manual_processing', actor_type: 'system',  at: at(28, 5_400_000) },
    { status: 'failed',                    actor_type: 'system',  at: at(28, 90_000_000), notes: 'Correspondent bank rejected. Account number format incorrect for SGD.' },
  ])

  const f3 = next()
  await insertPayment({
    tenant_id: remitx.id, user_id: maker1.id, checker_id: checker1.id,
    beneficiary_id: beneUS.id, account_id: usdAcc.id,
    source_currency: 'USD', source_amount: '9800.00', dest_currency: 'USD', dest_amount: '9800.00',
    exchange_rate: '1.00000', fee_amount: '49.00', purpose_code: 'SERVICES',
    reference: f3.ref, idempotency_key: f3.ikey, provider_name: 'manual', status: 'failed', created_at: d(6),
  }, [
    { status: 'pending_approval',          actor_id: maker1.id,   at: d(6) },
    { status: 'approved',                  actor_id: checker1.id, at: at(6, 3_600_000) },
    { status: 'pending_manual_processing', actor_type: 'system',  at: at(6, 7_200_000) },
    { status: 'failed',                    actor_type: 'system',  at: at(6, 36_000_000), notes: 'Provider timeout after 3 retries. Payment must be resubmitted.' },
  ])

  // ── 6F. CANCELLED ────────────────────────────────────────────────────────
  const c1 = next()
  await insertPayment({
    tenant_id: remitx.id, user_id: maker1.id,
    beneficiary_id: beneGB.id, account_id: usdAcc.id,
    source_currency: 'USD', source_amount: '2000.00', dest_currency: 'GBP', dest_amount: '1577.00',
    exchange_rate: '0.78850', fee_amount: '10.00', purpose_code: 'SALARY',
    reference: c1.ref, idempotency_key: c1.ikey, provider_name: 'manual', status: 'cancelled', created_at: d(35),
    note: 'Duplicate submission — cancelling',
  }, [
    { status: 'pending_approval', actor_id: maker1.id, at: d(35) },
    { status: 'cancelled',        actor_id: maker1.id, at: at(35, 1_200_000), notes: 'Cancelled by maker — duplicate of RX-2026-0006' },
  ])

  const c2 = next()
  await insertPayment({
    tenant_id: remitx.id, user_id: maker3.id,
    beneficiary_id: beneFR.id, account_id: usdAcc.id,
    source_currency: 'USD', source_amount: '5500.00', dest_currency: 'EUR', dest_amount: '5065.50',
    exchange_rate: '0.92100', fee_amount: '27.50', purpose_code: 'CONSULTING',
    reference: c2.ref, idempotency_key: c2.ikey, provider_name: 'manual', status: 'cancelled', created_at: d(10),
    note: 'Project cancelled, payment no longer needed',
  }, [
    { status: 'pending_approval', actor_id: maker3.id,   at: d(10) },
    { status: 'cancelled',        actor_id: cadmin.id,   at: at(10, 7_200_000), notes: 'Client cancelled project. Payment voided by admin.' },
  ])

  // ── 6G. PENDING MANUAL PROCESSING (admin queue) ──────────────────────────
  const pm1 = next()
  await insertPayment({
    tenant_id: remitx.id, user_id: maker1.id, checker_id: checker1.id,
    beneficiary_id: beneGB.id, account_id: usdAcc.id,
    source_currency: 'USD', source_amount: '7500.00', dest_currency: 'GBP', dest_amount: '5913.75',
    exchange_rate: '0.78850', fee_amount: '37.50', purpose_code: 'SALARY',
    reference: pm1.ref, idempotency_key: pm1.ikey, provider_name: 'manual', status: 'pending_manual_processing',
    note: 'Q2 salary batch', created_at: h(18),
  }, [
    { status: 'pending_approval',          actor_id: maker1.id,   at: h(20) },
    { status: 'approved',                  actor_id: checker1.id, at: h(18), notes: 'Approved — process today' },
    { status: 'pending_manual_processing', actor_type: 'system',  at: h(17) },
  ])

  const pm2 = next()
  await insertPayment({
    tenant_id: remitx.id, user_id: maker3.id, checker_id: checker2.id,
    beneficiary_id: beneAE.id, account_id: usdAcc.id,
    source_currency: 'USD', source_amount: '18500.00', dest_currency: 'AED', dest_amount: '67950.50',
    exchange_rate: '3.67300', fee_amount: '92.50', purpose_code: 'SERVICES',
    reference: pm2.ref, idempotency_key: pm2.ikey, provider_name: 'manual', status: 'pending_manual_processing',
    note: 'Dubai office services Q2', created_at: h(12),
  }, [
    { status: 'pending_approval',          actor_id: maker3.id,   at: h(14) },
    { status: 'approved',                  actor_id: checker2.id, at: h(12), notes: 'Large transfer verified' },
    { status: 'pending_manual_processing', actor_type: 'system',  at: h(11) },
  ])

  const pm3 = next()
  await insertPayment({
    tenant_id: remitx.id, user_id: maker1.id, checker_id: checker1.id,
    beneficiary_id: beneFR.id, account_id: usdAcc.id,
    source_currency: 'USD', source_amount: '12000.00', dest_currency: 'EUR', dest_amount: '11052.00',
    exchange_rate: '0.92100', fee_amount: '60.00', purpose_code: 'CONSULTING',
    reference: pm3.ref, idempotency_key: pm3.ikey, provider_name: 'manual', status: 'pending_manual_processing',
    note: 'Consulting invoice #INV-2026-044', created_at: h(6),
  }, [
    { status: 'pending_approval',          actor_id: maker1.id,   at: h(8) },
    { status: 'approved',                  actor_id: checker1.id, at: h(6), notes: 'Invoice matches PO' },
    { status: 'pending_manual_processing', actor_type: 'system',  at: h(5) },
  ])

  // ── 6H. APPROVED (awaiting dispatch) ─────────────────────────────────────
  const ap1 = next()
  await insertPayment({
    tenant_id: remitx.id, user_id: maker3.id, checker_id: checker2.id,
    beneficiary_id: beneIN.id, account_id: usdAcc.id,
    source_currency: 'USD', source_amount: '2500.00', dest_currency: 'INR', dest_amount: '208375.00',
    exchange_rate: '83.35000', fee_amount: '20.00', purpose_code: 'FAMILY',
    reference: ap1.ref, idempotency_key: ap1.ikey, provider_name: 'manual', status: 'approved',
    note: 'Monthly family support', created_at: h(4),
  }, [
    { status: 'pending_approval', actor_id: maker3.id,   at: h(5) },
    { status: 'approved',         actor_id: checker2.id, at: h(4), notes: 'Approved — schedule for next dispatch window' },
  ])

  // ── 6I. PENDING APPROVAL (live approval queue) ────────────────────────────
  const pa1 = next()
  await insertPayment({
    tenant_id: remitx.id, user_id: maker1.id,
    beneficiary_id: beneGB.id, account_id: usdAcc.id,
    source_currency: 'USD', source_amount: '9200.00', dest_currency: 'GBP', dest_amount: '7254.20',
    exchange_rate: '0.78850', fee_amount: '46.00', purpose_code: 'SALARY',
    reference: pa1.ref, idempotency_key: pa1.ikey, provider_name: 'manual', status: 'pending_approval',
    note: 'Senior developer monthly salary — June 2026', created_at: h(3),
  }, [{ status: 'pending_approval', actor_id: maker1.id, at: h(3) }])

  const pa2 = next()
  await insertPayment({
    tenant_id: remitx.id, user_id: maker3.id,
    beneficiary_id: beneEU.id, account_id: usdAcc.id,
    source_currency: 'USD', source_amount: '14500.00', dest_currency: 'EUR', dest_amount: '13354.50',
    exchange_rate: '0.92100', fee_amount: '72.50', purpose_code: 'CONSULTING',
    reference: pa2.ref, idempotency_key: pa2.ikey, provider_name: 'manual', status: 'pending_approval',
    note: 'Q2 consulting retainer — urgent', created_at: h(2),
  }, [{ status: 'pending_approval', actor_id: maker3.id, at: h(2) }])

  const pa3 = next()
  await insertPayment({
    tenant_id: remitx.id, user_id: maker1.id,
    beneficiary_id: beneDE.id, account_id: usdAcc.id,
    source_currency: 'USD', source_amount: '21000.00', dest_currency: 'EUR', dest_amount: '19341.00',
    exchange_rate: '0.92100', fee_amount: '105.00', purpose_code: 'CONSULTING',
    reference: pa3.ref, idempotency_key: pa3.ikey, provider_name: 'manual', status: 'pending_approval',
    note: 'Engineering consultancy — 3-month block', created_at: h(1.5),
  }, [{ status: 'pending_approval', actor_id: maker1.id, at: h(1.5) }])

  const pa4 = next()
  await insertPayment({
    tenant_id: remitx.id, user_id: maker3.id,
    beneficiary_id: beneAE.id, account_id: usdAcc.id,
    source_currency: 'USD', source_amount: '35000.00', dest_currency: 'AED', dest_amount: '128555.00',
    exchange_rate: '3.67300', fee_amount: '175.00', purpose_code: 'INVESTMENT',
    reference: pa4.ref, idempotency_key: pa4.ikey, provider_name: 'manual', status: 'pending_approval',
    note: 'AED property acquisition deposit', created_at: h(1),
  }, [{ status: 'pending_approval', actor_id: maker3.id, at: h(1) }])

  // ── Final USD ledger balance snapshot ────────────────────────────────────
  await knex('ledger_entries').insert({
    tenant_id: remitx.id, account_id: usdAcc.id,
    entry_type: 'credit', amount: '0.00', currency: 'USD',
    balance_after: usdBal.toFixed(2),
    description: 'Balance reconciliation snapshot',
    created_at: new Date(),
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // 7.  KYC APPLICATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  await knex('kyc_applications').insert([
    // Submitted (live queue — 4 items)
    {
      tenant_id: remitx.id, user_id: maker2.id, status: 'submitted', created_at: d(2),
      documents: JSON.stringify([
        { filename: 'passport_nakamura.jpg',    type: 'passport',      path: '/uploads/kyc/passport_nakamura.jpg' },
        { filename: 'utility_bill_nakamura.pdf', type: 'address_proof', path: '/uploads/kyc/utility_bill_nakamura.pdf' },
      ]),
    },
    {
      tenant_id: remitx.id, user_id: kycUser3.id, status: 'submitted', created_at: d(1),
      documents: JSON.stringify([
        { filename: 'national_id_kowalski.jpg',   type: 'national_id',   path: '/uploads/kyc/national_id_kowalski.jpg' },
        { filename: 'bank_statement_kowalski.pdf', type: 'bank_statement',path: '/uploads/kyc/bank_statement_kowalski.pdf' },
      ]),
    },
    {
      tenant_id: remitx.id, user_id: kycUser4.id, status: 'submitted', created_at: h(8),
      documents: JSON.stringify([
        { filename: 'passport_okonkwo.jpg',        type: 'passport',      path: '/uploads/kyc/passport_okonkwo.jpg' },
        { filename: 'proof_of_address_okonkwo.pdf', type: 'address_proof', path: '/uploads/kyc/proof_of_address_okonkwo.pdf' },
        { filename: 'selfie_okonkwo.jpg',           type: 'selfie',        path: '/uploads/kyc/selfie_okonkwo.jpg' },
      ]),
    },
    // Historical: approved
    {
      tenant_id: remitx.id, user_id: maker1.id, status: 'approved', created_at: d(45),
      reviewed_at: d(43),
      documents: JSON.stringify([
        { filename: 'passport_thornton.jpg', type: 'passport', path: '/uploads/kyc/passport_thornton.jpg' },
        { filename: 'utility_bill_thornton.pdf', type: 'address_proof', path: '/uploads/kyc/utility_bill_thornton.pdf' },
      ]),
    },
    // Historical: rejected
    {
      tenant_id: remitx.id, user_id: cadmin.id, status: 'rejected', created_at: d(60),
      reviewed_at: d(58),
      documents: JSON.stringify([
        { filename: 'id_expired_harrington.jpg', type: 'national_id', path: '/uploads/kyc/id_expired_harrington.jpg' },
      ]),
    },
  ])

  // ═══════════════════════════════════════════════════════════════════════════
  // 8.  NOTIFICATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  await knex('notifications').insert([
    // super_admin — operational mix
    { tenant_id: remitx.id, user_id: superAdmin.id, type: 'kyc.submitted',           title: 'KYC application received',        body: 'Bob Nakamura has submitted KYC documents for review.',                  metadata: JSON.stringify({ user_id: maker2.id }),         read_at: null,   created_at: d(2)  },
    { tenant_id: remitx.id, user_id: superAdmin.id, type: 'kyc.submitted',           title: 'KYC application received',        body: 'Elena Kowalski has submitted KYC documents.',                           metadata: JSON.stringify({ user_id: kycUser3.id }),       read_at: null,   created_at: d(1)  },
    { tenant_id: remitx.id, user_id: superAdmin.id, type: 'kyc.submitted',           title: 'KYC application received',        body: 'Thomas Okonkwo has submitted KYC documents with selfie.',               metadata: JSON.stringify({ user_id: kycUser4.id }),       read_at: null,   created_at: h(8)  },
    { tenant_id: remitx.id, user_id: superAdmin.id, type: 'payment.pending_approval',title: 'Payment awaiting approval',       body: `${pa1.ref}: USD 9,200 to John Smith waiting for checker.`,              metadata: JSON.stringify({ ref: pa1.ref }),               read_at: null,   created_at: h(3)  },
    { tenant_id: remitx.id, user_id: superAdmin.id, type: 'payment.pending_approval',title: 'Payment awaiting approval',       body: `${pa2.ref}: USD 14,500 to Maria Garcia waiting for checker.`,           metadata: JSON.stringify({ ref: pa2.ref }),               read_at: null,   created_at: h(2)  },
    { tenant_id: remitx.id, user_id: superAdmin.id, type: 'payment.pending_approval',title: 'High-value payment pending',      body: `${pa4.ref}: USD 35,000 investment transfer needs dual-checker sign-off.`, metadata: JSON.stringify({ ref: pa4.ref }),            read_at: null,   created_at: h(1)  },
    { tenant_id: remitx.id, user_id: superAdmin.id, type: 'payment.status_changed',  title: 'Payment completed',               body: `${pm1.ref} to John Smith completed — GBP 5,913.75 delivered.`,          metadata: JSON.stringify({ ref: pm1.ref }),               read_at: d(1),   created_at: d(1)  },
    { tenant_id: remitx.id, user_id: superAdmin.id, type: 'payment.status_changed',  title: 'Payment rejected — compliance',   body: `${r3.ref}: USD 120,000 AED transfer rejected — exceeds corridor limit.`,  metadata: JSON.stringify({ ref: r3.ref }),              read_at: d(17),  created_at: d(18) },
    { tenant_id: remitx.id, user_id: superAdmin.id, type: 'payment.status_changed',  title: 'Payment failed',                  body: `${f3.ref}: Provider timeout on USD 9,800. Must be resubmitted.`,        metadata: JSON.stringify({ ref: f3.ref }),               read_at: null,   created_at: d(6)  },

    // maker1 — payment lifecycle
    { tenant_id: remitx.id, user_id: maker1.id, type: 'payment.status_changed',      title: 'Payment approved',                body: `Your payment to Klaus Hoffmann (${ap1.ref}) has been approved.`,        metadata: JSON.stringify({ ref: ap1.ref }),               read_at: null,   created_at: h(4)  },
    { tenant_id: remitx.id, user_id: maker1.id, type: 'payment.status_changed',      title: 'Payment completed',               body: 'AED 102,844 investment transfer completed successfully.',                 metadata: JSON.stringify({ ref: r3.ref }),               read_at: h(2),   created_at: d(3)  },
    { tenant_id: remitx.id, user_id: maker1.id, type: 'payment.status_changed',      title: 'Payment rejected',                body: `${r3.ref} was rejected — amount exceeds single-transaction limit.`,     metadata: JSON.stringify({ ref: r3.ref }),               read_at: null,   created_at: d(18) },
    { tenant_id: remitx.id, user_id: maker1.id, type: 'payment.status_changed',      title: 'Payment failed',                  body: `${f3.ref} failed due to provider timeout. Please resubmit.`,           metadata: JSON.stringify({ ref: f3.ref }),               read_at: null,   created_at: d(6)  },
    { tenant_id: remitx.id, user_id: maker1.id, type: 'kyc.approved',                title: 'KYC verification approved',       body: 'Your identity has been verified. All payment limits are now active.',    metadata: '{}',                                          read_at: d(42),  created_at: d(43) },

    // checker1 — approval queue
    { tenant_id: remitx.id, user_id: checker1.id, type: 'payment.pending_approval',  title: 'Action required: USD 9,200',      body: `${pa1.ref} from Alice Thornton awaiting your approval.`,               metadata: JSON.stringify({ ref: pa1.ref }),               read_at: null,   created_at: h(3)  },
    { tenant_id: remitx.id, user_id: checker1.id, type: 'payment.pending_approval',  title: 'Action required: USD 21,000',     body: `${pa3.ref} — large consulting transfer needs your sign-off.`,          metadata: JSON.stringify({ ref: pa3.ref }),               read_at: null,   created_at: h(1.5)},
    { tenant_id: remitx.id, user_id: checker1.id, type: 'payment.pending_approval',  title: 'Action required: USD 35,000',     body: `${pa4.ref} — investment transfer exceeds $10K. Priority review.`,      metadata: JSON.stringify({ ref: pa4.ref }),               read_at: null,   created_at: h(1)  },

    // maker3
    { tenant_id: remitx.id, user_id: maker3.id, type: 'payment.status_changed',      title: 'Payment rejected',                body: `${r2.ref} to Emeka Okafor rejected — beneficiary AML pending.`,        metadata: JSON.stringify({ ref: r2.ref }),               read_at: d(39),  created_at: d(40) },
    { tenant_id: remitx.id, user_id: maker3.id, type: 'payment.status_changed',      title: 'Payment completed',               body: 'SGD 11,836 to Lim Wei Xiong delivered successfully.',                    metadata: '{}',                                          read_at: d(1),   created_at: d(2)  },
  ])

  // ═══════════════════════════════════════════════════════════════════════════
  // 9.  RECONCILIATION REPORTS — 30 days
  // ═══════════════════════════════════════════════════════════════════════════

  const reconRows = Array.from({ length: 30 }, (_, i) => {
    const dt      = new Date(); dt.setDate(dt.getDate() - (i + 1))
    const dateStr = dt.toISOString().split('T')[0]
    const dayOfWeek = dt.getDay()
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6

    // Realistic: fewer payments on weekends, occasional exceptions
    const total    = isWeekend ? 2 + (i % 3) : 8 + (i % 7)
    const hasEx    = !isWeekend && (i === 3 || i === 11 || i === 19)
    const unmatched = hasEx ? (1 + (i % 2)) : 0
    const amount   = (total * (3500 + i * 200)).toFixed(2)

    return {
      tenant_id:       remitx.id,
      report_date:     dateStr,
      total_payments:  total,
      total_amount:    amount,
      matched_count:   total - unmatched,
      unmatched_count: unmatched,
      exceptions: JSON.stringify(hasEx ? [
        { payment_id: `RX-RECON-${dateStr}-01`, reason: 'Amount mismatch with provider', diff: '12.50' },
        ...(unmatched > 1 ? [{ payment_id: `RX-RECON-${dateStr}-02`, reason: 'Missing provider settlement reference' }] : []),
      ] : []),
      status: hasEx ? 'exceptions' : 'matched',
    }
  })
  await knex('reconciliation_reports').insert(reconRows)

  // ═══════════════════════════════════════════════════════════════════════════
  // 10. PROVIDER CORRIDOR CONFIGS
  // ═══════════════════════════════════════════════════════════════════════════

  await knex('provider_corridor_configs')
    .insert([
      { tenant_id: remitx.id, source_currency: 'USD', dest_currency: 'GBP', provider_name: 'manual',        priority: 1,  is_active: true },
      { tenant_id: remitx.id, source_currency: 'USD', dest_currency: 'EUR', provider_name: 'manual',        priority: 1,  is_active: true },
      { tenant_id: remitx.id, source_currency: 'USD', dest_currency: 'INR', provider_name: 'zoqq',          priority: 1,  is_active: true },
      { tenant_id: remitx.id, source_currency: 'USD', dest_currency: 'AED', provider_name: 'manual',        priority: 1,  is_active: true },
      { tenant_id: remitx.id, source_currency: 'USD', dest_currency: 'SGD', provider_name: 'manual',        priority: 1,  is_active: true },
      { tenant_id: remitx.id, source_currency: 'USD', dest_currency: 'MXN', provider_name: 'cloudcurrency', priority: 1,  is_active: true },
      { tenant_id: remitx.id, source_currency: 'USD', dest_currency: 'NGN', provider_name: 'manual',        priority: 1,  is_active: false }, // inactive — no cleared bene yet
      { tenant_id: remitx.id, source_currency: 'USD', dest_currency: 'PKR', provider_name: 'manual',        priority: 1,  is_active: false }, // inactive — pending AML
      { tenant_id: remitx.id, source_currency: 'GBP', dest_currency: 'USD', provider_name: 'cloudcurrency', priority: 1,  is_active: true },
      { tenant_id: remitx.id, source_currency: 'EUR', dest_currency: 'USD', provider_name: 'cloudcurrency', priority: 1,  is_active: true },
      { tenant_id: remitx.id, source_currency: 'USD', dest_currency: null,  provider_name: 'manual',        priority: 99, is_active: true },  // fallback
    ])
    .onConflict(['tenant_id', 'source_currency', 'dest_currency'])
    .ignore()

  // ═══════════════════════════════════════════════════════════════════════════
  // 11. FEE CONFIGS
  // ═══════════════════════════════════════════════════════════════════════════

  await knex('fee_configs')
    .insert([
      // USD → GBP: 0.5% (min $10, max $200)
      { tenant_id: remitx.id, source_currency: 'USD', dest_currency: 'GBP', fee_type: 'percent', fee_value: '0.50000000', min_fee: '10.00000000', max_fee: '200.00000000', is_active: true },
      // USD → EUR: 0.5% (min $10, max $200)
      { tenant_id: remitx.id, source_currency: 'USD', dest_currency: 'EUR', fee_type: 'percent', fee_value: '0.50000000', min_fee: '10.00000000', max_fee: '200.00000000', is_active: true },
      // USD → INR: flat $8
      { tenant_id: remitx.id, source_currency: 'USD', dest_currency: 'INR', fee_type: 'flat',    fee_value: '8.00000000', min_fee: null,           max_fee: null,           is_active: true },
      // USD → AED: 0.5% (min $20, max $500)
      { tenant_id: remitx.id, source_currency: 'USD', dest_currency: 'AED', fee_type: 'percent', fee_value: '0.50000000', min_fee: '20.00000000', max_fee: '500.00000000', is_active: true },
      // USD → SGD: 0.5% (min $15)
      { tenant_id: remitx.id, source_currency: 'USD', dest_currency: 'SGD', fee_type: 'percent', fee_value: '0.50000000', min_fee: '15.00000000', max_fee: '250.00000000', is_active: true },
      // USD → MXN: 0.5% (min $10)
      { tenant_id: remitx.id, source_currency: 'USD', dest_currency: 'MXN', fee_type: 'percent', fee_value: '0.50000000', min_fee: '10.00000000', max_fee: '150.00000000', is_active: true },
      // USD → USD (domestic): flat $5
      { tenant_id: remitx.id, source_currency: 'USD', dest_currency: 'USD', fee_type: 'flat',    fee_value: '5.00000000', min_fee: null,           max_fee: null,           is_active: true },
      // Wildcard fallback: 0.75%
      { tenant_id: remitx.id, source_currency: 'USD', dest_currency: null,  fee_type: 'percent', fee_value: '0.75000000', min_fee: '10.00000000', max_fee: '300.00000000', is_active: true },
    ])
    .onConflict(['tenant_id', 'source_currency', 'dest_currency'])
    .ignore()

  // ═══════════════════════════════════════════════════════════════════════════
  // 12. APPROVAL RULES — acme + globalpay
  // ═══════════════════════════════════════════════════════════════════════════

  await knex('approval_rules').insert([
    { tenant_id: acme.id,      name: 'Auto-approve small', min_amount: '0',        max_amount: '4999.99',   auto_approve: true,  required_approvals: 0, priority: 1 },
    { tenant_id: acme.id,      name: 'Single checker',     min_amount: '5000',     max_amount: null,        auto_approve: false, required_approvals: 1, priority: 2 },
    { tenant_id: globalpay.id, name: 'Auto-approve small', min_amount: '0',        max_amount: '9999.99',   auto_approve: true,  required_approvals: 0, priority: 1 },
    { tenant_id: globalpay.id, name: 'Single checker',     min_amount: '10000',    max_amount: '99999.99',  auto_approve: false, required_approvals: 1, priority: 2 },
    { tenant_id: globalpay.id, name: 'Dual checker',       min_amount: '100000',   max_amount: null,        auto_approve: false, required_approvals: 2, priority: 3 },
  ])

  // ═══════════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('\n[seed] ✓ Investor-demo data seeded')
  console.log('═'.repeat(72))
  console.log('  TENANTS')
  console.log('  ─────────────────────────────────────────────────────────')
  console.log('  remitx            active   (default workspace)')
  console.log('  acme-corp         active')
  console.log('  globalpay         active')
  console.log('  sterling-money    suspended')
  console.log('  paybridge         inactive')
  console.log('  fintech-ventures  pending')
  console.log('═'.repeat(72))
  console.log('  CREDENTIALS  (all passwords: Test@1234!  except super_admin)')
  console.log('  ─────────────────────────────────────────────────────────')
  console.log('  admin@remitx.com        Admin@RemitX2024!  super_admin  approved  active')
  console.log('  cadmin@remitx.com       Test@1234!         client_admin approved  active')
  console.log('  maker1@remitx.com       Test@1234!         maker        approved  active')
  console.log('  maker2@remitx.com       Test@1234!         maker        submitted active  ← KYC queue')
  console.log('  maker3@remitx.com       Test@1234!         maker        approved  active')
  console.log('  checker1@remitx.com     Test@1234!         checker      approved  active')
  console.log('  checker2@remitx.com     Test@1234!         checker      approved  active')
  console.log('  kyc3@remitx.com         Test@1234!         maker        submitted active  ← KYC queue')
  console.log('  kyc4@remitx.com         Test@1234!         maker        submitted active  ← KYC queue')
  console.log('  inactive@remitx.com     Test@1234!         maker        pending   inactive')
  console.log('  suspended@remitx.com    Test@1234!         maker        approved  suspended')
  console.log('  admin@acme.com          Test@1234!         client_admin approved  active  (acme)')
  console.log('  admin@globalpay.com     Test@1234!         client_admin approved  active  (globalpay)')
  console.log('═'.repeat(72))
  console.log('  PAYMENTS SUMMARY')
  console.log(`  Total payments:         ${_ref}`)
  console.log('  ├─ pending_approval:    4   (live approval queue)')
  console.log('  ├─ approved:            1   (awaiting dispatch)')
  console.log('  ├─ pending_manual:      3   (admin manual queue)')
  console.log('  ├─ completed:           45  (spread over 90 days)')
  console.log('  ├─ rejected:            4   (compliance decisions)')
  console.log('  ├─ failed:              3   (provider errors)')
  console.log('  └─ cancelled:           2')
  console.log('═'.repeat(72))
  console.log('  DATA COVERAGE')
  console.log('  ├─ Accounts:            4 (USD $2M cap | GBP £150K | EUR €250K | AED 750K)')
  console.log('  ├─ Beneficiaries:       11 (8 cleared | 2 pending | 1 flagged)')
  console.log('  ├─ KYC queue:           3 submitted (maker2, kyc3, kyc4)')
  console.log('  ├─ Reconciliation:      30 days (3 days with exceptions)')
  console.log('  ├─ Fee configs:         8 corridor rules')
  console.log('  └─ Notifications:       19 across 4 users')
  console.log('═'.repeat(72) + '\n')
}
