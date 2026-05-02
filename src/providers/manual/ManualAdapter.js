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

  async createAccount({ currency, userId, tenantId }) {
    const ref = `ACC-${randomBytes(4).toString('hex').toUpperCase()}`;
    return {
      providerName: 'manual',
      providerAccountId: ref,
      accountNumber: ref,
    };
  }

  async getFxRate(from, to) {
    const fromRates = INDICATIVE_RATES[from.toUpperCase()];
    if (fromRates) {
      const rate = fromRates[to.toUpperCase()];
      if (rate) return String(rate);
    }
    // Fallback: 1:1
    return '1.00000000';
  }

  async getQuote({ sourceCurrency, targetCurrency, amount }) {
    const midRate = await this.getFxRate(sourceCurrency, targetCurrency);
    const rate = applySpread(midRate, config.defaultFxSpread);
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

  async getSettlementReport(date) {
    return { date, matched: [], unmatched: [] };
  }

  parseWebhook(headers, body) {
    return body;
  }

  verifyWebhookSignature(headers, rawBody) {
    return true; // Manual adapter has no webhook signing
  }
}
