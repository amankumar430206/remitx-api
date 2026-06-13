import Big from 'big.js';

// ─── Status maps ──────────────────────────────────────────────────────────────

const PAYOUT_STATUS_MAP = {
  PENDING:    'processing',
  PROCESSING: 'processing',
  COMPLETED:  'completed',
  FAILED:     'failed',
  CANCELLED:  'failed',
  REJECTED:   'failed',
};

export const mapPayoutStatus = (zoqqStatus) =>
  PAYOUT_STATUS_MAP[String(zoqqStatus).toUpperCase()] ?? 'processing';

// ─── FX ───────────────────────────────────────────────────────────────────────

export const mapLiveRate = (zoqqRes, sourceCurrency, targetCurrency) => ({
  sourceCurrency: sourceCurrency.toUpperCase(),
  targetCurrency: targetCurrency.toUpperCase(),
  // Zoqq returns rate field in transfer/rate response
  rate: String(zoqqRes.rate ?? zoqqRes.exchange_rate ?? '1'),
  timestamp: new Date(),
});

export const mapQuote = (zoqqRes, sourceCurrency, targetCurrency, fxQuoteTtlSeconds) => ({
  provider: 'zoqq',
  providerQuoteId: zoqqRes.quote_id ?? zoqqRes.id ?? null,
  sourceCurrency: sourceCurrency.toUpperCase(),
  targetCurrency: targetCurrency.toUpperCase(),
  rate: String(zoqqRes.rate ?? zoqqRes.exchange_rate ?? '1'),
  fee: String(zoqqRes.fee ?? zoqqRes.total_fee ?? '0'),
  sourceAmount: zoqqRes.source_amount != null ? new Big(zoqqRes.source_amount).toFixed(8) : null,
  destinationAmount: zoqqRes.destination_amount != null ? new Big(zoqqRes.destination_amount).toFixed(8) : null,
  expiresAt: zoqqRes.expiry
    ? new Date(zoqqRes.expiry)
    : new Date(Date.now() + fxQuoteTtlSeconds * 1000),
});

// ─── Accounts ─────────────────────────────────────────────────────────────────

export const mapAccount = (zoqqRes) => ({
  providerName: 'zoqq',
  providerAccountId: zoqqRes.account_id ?? zoqqRes.id,
  accountNumber: zoqqRes.account_number ?? zoqqRes.account_id ?? zoqqRes.id,
});

// ─── Beneficiary ──────────────────────────────────────────────────────────────

export const mapBeneficiary = (zoqqRes) => ({
  providerBeneficiaryId: zoqqRes.beneficiary_id ?? zoqqRes.id,
  status: (zoqqRes.status ?? 'active').toLowerCase(),
  metadata: zoqqRes,
});

// ─── Payment (payout) ─────────────────────────────────────────────────────────

export const mapPayoutSubmit = (zoqqRes) => ({
  externalRef: zoqqRes.payout_id ?? zoqqRes.id,
  status: mapPayoutStatus(zoqqRes.status ?? 'PENDING'),
});

export const mapPayoutStatus_ = (zoqqRes) => ({
  externalRef: zoqqRes.payout_id ?? zoqqRes.id,
  status: mapPayoutStatus(zoqqRes.status ?? 'PENDING'),
});

// ─── Beneficiary request body builder ─────────────────────────────────────────

export const buildBeneficiaryPayload = (beneficiary) => {
  const b = beneficiary;
  return {
    beneficiary: {
      entity_type: b.entity_type ?? (b.account_holder_name ? 'INDIVIDUAL' : 'COMPANY'),
      company_name: b.company_name ?? b.name ?? null,
      individual_name: b.account_holder_name ?? null,
      bank_details: {
        account_currency: b.account_currency ?? b.currency,
        account_name:     b.account_holder_name ?? b.name,
        account_number:   b.account_number,
        bank_country_code: b.bank_country_code ?? b.country_code,
        bank_name:        b.bank_name ?? null,
        swift_code:       b.swift_code ?? null,
        account_routing_value1: b.routing_number ?? b.sort_code ?? null,
        account_routing_type1:  b.routing_type ?? null,
      },
      address: {
        country_code:   b.country_code,
        postcode:       b.postcode ?? b.postal_code ?? null,
        street_address: b.street_address ?? b.address_line1 ?? null,
        city:           b.city ?? null,
        state:          b.state ?? null,
      },
    },
    transfer_methods: b.transfer_methods ?? ['SWIFT'],
  };
};
