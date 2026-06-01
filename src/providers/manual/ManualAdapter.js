import { randomBytes } from 'crypto';
import { IPaymentProvider } from '../IPaymentProvider.js';
import { config } from '../../config/index.js';
import { applySpread } from '../../shared/utils/money.js';

// Indicative mid-rates vs USD — updated Phase 4 with live feed
const INDICATIVE_RATES = {
  USD: { USD: 1, EUR: 0.92, GBP: 0.79, INR: 83.5, AED: 3.67, SGD: 1.35, CAD: 1.36, AUD: 1.53 },
  EUR: { USD: 1.09, EUR: 1, GBP: 0.86, INR: 90.8, AED: 4.0, SGD: 1.47, CAD: 1.48, AUD: 1.66 },
  GBP: { USD: 1.27, EUR: 1.17, GBP: 1, INR: 106.3, AED: 4.66, SGD: 1.71, CAD: 1.72, AUD: 1.93 },
};

export class ManualAdapter extends IPaymentProvider {
  get name() { return 'manual'; }

  // ─── Payment ───────────────────────────────────────────────────────────────

  async getQuote({ sourceCurrency, targetCurrency, amount }) {
    const midRate = await this.getLiveRate({ sourceCurrency, targetCurrency });
    const rate = applySpread(midRate.rate, config.defaultFxSpread);
    return {
      provider: 'manual',
      sourceCurrency,
      targetCurrency,
      rate,
      fee: '0.00000000',
      expiresAt: new Date(Date.now() + config.fxQuoteTtlSeconds * 1000),
    };
  }

  async submitPayment({ payment }) {
    return {
      externalRef: `MAN-${payment.id}`,
      status: 'pending_manual_processing',
    };
  }

  async getPaymentStatus({ externalRef }) {
    return { externalRef, status: 'pending_manual_processing' };
  }

  async cancelPayment({ externalRef }) {
    return { externalRef, status: 'cancelled' };
  }

  // ─── Account ───────────────────────────────────────────────────────────────

  async createAccount({ currency, userId, tenantId }) {
    const ref = `ACC-${randomBytes(4).toString('hex').toUpperCase()}`;
    return {
      providerName: 'manual',
      providerAccountId: ref,
      accountNumber: ref,
    };
  }

  // ─── Tenant / user onboarding ──────────────────────────────────────────────
  // Manual provider manages everything in-house — no external registration needed.

  async onboardTenant({ tenant }) {
    return { providerCustomerId: null, status: 'active', metadata: null };
  }

  async onboardUser({ user, tenant }) {
    return { providerCustomerId: null, status: 'active', metadata: null };
  }

  // ─── KYC delegation ────────────────────────────────────────────────────────
  // Manual KYC is reviewed in-house by compliance officers, not delegated.

  async submitKyc({ user, documents, tenant }) {
    return { providerKycRef: null, status: 'pending' };
  }

  async getKycStatus({ providerKycRef }) {
    return { providerKycRef: null, status: 'pending', verifiedAt: null };
  }

  // ─── Beneficiary sync ──────────────────────────────────────────────────────
  // Manual provider has no external counterparty registry.

  async createBeneficiary({ beneficiary, user, tenant }) {
    return { providerBeneficiaryId: null, status: 'active', metadata: null };
  }

  async syncBeneficiary({ beneficiary, providerBeneficiaryId, user, tenant }) {
    return { providerBeneficiaryId: null, status: 'active' };
  }

  async deleteBeneficiary({ providerBeneficiaryId }) {
    return { providerBeneficiaryId: null, status: 'deleted' };
  }

  // ─── FX ────────────────────────────────────────────────────────────────────

  async getLiveRate({ sourceCurrency, targetCurrency }) {
    const fromRates = INDICATIVE_RATES[sourceCurrency?.toUpperCase()];
    const rate = fromRates?.[targetCurrency?.toUpperCase()] ?? '1.00000000';
    return {
      sourceCurrency,
      targetCurrency,
      rate: String(rate),
      timestamp: new Date(),
    };
  }

  // ─── Reconciliation ────────────────────────────────────────────────────────

  async getSettlementReport(date) {
    return { date, matched: [], unmatched: [] };
  }

  // ─── Webhooks ──────────────────────────────────────────────────────────────

  verifyWebhookSignature(headers, rawBody) {
    return true; // Manual adapter has no webhook signing
  }

  parseWebhook(headers, body) {
    return body;
  }
}
