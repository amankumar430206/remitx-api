import { v4 as uuidv4 } from 'uuid';
import { config } from '../../config/index.js';
import { IPaymentProvider } from '../IPaymentProvider.js';
import { ZoqqClient } from './ZoqqClient.js';
import {
  mapLiveRate,
  mapQuote,
  mapAccount,
  mapBeneficiary,
  mapPayoutSubmit,
  mapPayoutStatus_,
  buildBeneficiaryPayload,
} from './zoqq.mappers.js';

export class ZoqqAdapter extends IPaymentProvider {
  constructor(tenantCreds) {
    super();
    this.client = new ZoqqClient({
      userId:   tenantCreds.user_id,
      tenantId: tenantCreds.tenant_id,
    });
  }

  get name() { return 'zoqq'; }

  // ─── Connectivity ─────────────────────────────────────────────────────────

  async ping() {
    await this.client.request('GET', '/zoqq/api/v1/user');
  }

  // ─── FX ──────────────────────────────────────────────────────────────────

  async getLiveRate({ sourceCurrency, targetCurrency }) {
    const res = await this.client.request(
      'GET',
      `/zoqq/api/v1/transfer/rate?sourceAmount=1&sourceCurrencyCode=${sourceCurrency}&destinationCurrencyCode=${targetCurrency}&destinationAmount=`,
    );
    return mapLiveRate(res, sourceCurrency, targetCurrency);
  }

  async getQuote({ sourceCurrency, targetCurrency, amount, quoteType, lockPeriod, conversionSchedule }) {
    const res = await this.client.request('POST', '/zoqq/api/v1/transfer/quote', {
      quoteType:               quoteType          ?? 'payout',
      lockPeriod:              lockPeriod         ?? '15_mins',
      conversionSchedule:      conversionSchedule ?? 'immediate',
      sourceCurrencyCode:      sourceCurrency,
      destinationCurrencyCode: targetCurrency,
      sourceAmount:            Number(amount),
      destinationAmount:       null,
    }, uuidv4());
    return mapQuote(res, sourceCurrency, targetCurrency, config.fxQuoteTtlSeconds);
  }

  // ─── Accounts ─────────────────────────────────────────────────────────────

  async createAccount({ currency, userId, tenantId }) {
    const res = await this.client.request('POST', '/zoqq/api/v1/account', {
      type:     'virtual_account',
      country:  'SG',
      currency: currency.toUpperCase(),
      label:    `RemitX ${currency.toUpperCase()} Account`,
      required_features: [{ currency: currency.toUpperCase(), transfer_method: 'LOCAL' }],
    }, uuidv4());
    return mapAccount(res);
  }

  // ─── Onboarding ───────────────────────────────────────────────────────────
  // When a tenant is configured with Zoqq, their user_id already exists in
  // Zoqq's system. We just confirm it's reachable.

  async onboardTenant({ tenant }) {
    const res = await this.client.request('GET', '/zoqq/api/v1/user');
    return {
      providerCustomerId: res?.id ?? this.client.userId,
      status: 'active',
      metadata: res,
    };
  }

  async onboardUser({ user, tenant }) {
    // Individual users share the tenant's Zoqq identity in this model.
    return { providerCustomerId: this.client.userId, status: 'active', metadata: null };
  }

  // ─── KYC ──────────────────────────────────────────────────────────────────
  // KYC is handled externally before Zoqq onboards the client.
  // RemitX delegates KYC to its own compliance flow; Zoqq just needs the user_id.

  async submitKyc({ user, documents, tenant }) {
    return { providerKycRef: this.client.userId, status: 'pending' };
  }

  async getKycStatus({ providerKycRef }) {
    const res = await this.client.request('GET', '/zoqq/api/v1/user');
    const status = res?.kyc_status?.toLowerCase() ?? 'pending';
    return { providerKycRef, status, verifiedAt: res?.kyc_verified_at ?? null };
  }

  // ─── Beneficiary ──────────────────────────────────────────────────────────

  async createBeneficiary({ beneficiary, user, tenant }) {
    const payload = buildBeneficiaryPayload(beneficiary);
    const res = await this.client.request(
      'POST', '/zoqq/api/v1/transfer/beneficiary', payload, uuidv4(),
    );
    return mapBeneficiary(res);
  }

  async syncBeneficiary({ beneficiary, providerBeneficiaryId, user, tenant }) {
    const payload = buildBeneficiaryPayload(beneficiary);
    const res = await this.client.request(
      'PATCH', `/zoqq/api/v1/transfer/beneficiary/${providerBeneficiaryId}`, payload, uuidv4(),
    );
    return mapBeneficiary(res);
  }

  async deleteBeneficiary({ providerBeneficiaryId }) {
    await this.client.request(
      'DELETE', `/zoqq/api/v1/transfer/beneficiary/${providerBeneficiaryId}`, null, uuidv4(),
    );
    return { providerBeneficiaryId, status: 'deleted' };
  }

  // ─── Payment (payout) ────────────────────────────────────────────────────

  async submitPayment({ payment, quote }) {
    const res = await this.client.request('POST', '/zoqq/api/v1/transfer/payout', {
      beneficiaryId:           payment.provider_beneficiary_id,
      sourceAmount:            Number(payment.source_amount),
      sourceCurrencycode:      payment.source_currency,
      destinationAmount:       null,
      destinationCurrencycode: payment.dest_currency,
      destinationCountry:      payment.dest_country ?? null,
      feeType:                 'SHA',
      quoteId:                 quote?.providerQuoteId ?? null,
      reference:               payment.reference ?? payment.id,
      sourceOfFunds:           payment.purpose_code ?? 'professional_business_services',
      transferMethod:          payment.transfer_method ?? 'SWIFT',
    }, payment.idempotency_key ?? uuidv4());
    return mapPayoutSubmit(res);
  }

  async getPaymentStatus({ externalRef }) {
    const res = await this.client.request('GET', `/zoqq/api/v1/transfer/payout/${externalRef}`);
    return mapPayoutStatus_(res);
  }

  async cancelPayment({ externalRef }) {
    const res = await this.client.request('PATCH', '/zoqq/api/v1/transfer/cancelpayout', {
      id: externalRef,
    }, uuidv4());
    return { externalRef, status: 'failed' };
  }

  // ─── Reconciliation ───────────────────────────────────────────────────────

  async getSettlementReport(date) {
    return { date, matched: [], unmatched: [] };
  }

  // ─── Webhooks ─────────────────────────────────────────────────────────────

  verifyWebhookSignature(headers, rawBody) {
    return this.client.verifyWebhookSignature(headers);
  }

  parseWebhook(headers, body) {
    // Normalise Zoqq payout events → internal event shape
    const eventType = this._mapZoqqEvent(body.event_type ?? body.eventType ?? '');
    return {
      eventType,
      eventId:   body.event_id ?? body.id ?? body.payout_id,
      externalRef: body.payout_id ?? body.id,
      tenantId:  null, // resolved by caller via x-api-key lookup
      raw:       body,
    };
  }

  _mapZoqqEvent(zoqqEvent) {
    const map = {
      'payout.completed':   'payment.completed',
      'payout.failed':      'payment.failed',
      'payout.cancelled':   'payment.failed',
      'payout.rejected':    'payment.failed',
    };
    return map[zoqqEvent.toLowerCase()] ?? zoqqEvent;
  }
}
