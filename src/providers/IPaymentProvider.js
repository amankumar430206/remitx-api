export class IPaymentProvider {

  // ─── Payment ───────────────────────────────────────────────────────────────

  async getQuote({ sourceCurrency, targetCurrency, amount }) {
    throw new Error('getQuote() must be implemented');
  }

  async submitPayment({ payment, quote }) {
    throw new Error('submitPayment() must be implemented');
  }

  async getPaymentStatus({ externalRef }) {
    throw new Error('getPaymentStatus() must be implemented');
  }

  async cancelPayment({ externalRef }) {
    throw new Error('cancelPayment() must be implemented');
  }

  // ─── Account ───────────────────────────────────────────────────────────────

  // Called when a user account is provisioned for a currency.
  // Returns: { providerName, providerAccountId, accountNumber }
  async createAccount({ currency, userId, tenantId }) {
    throw new Error('createAccount() must be implemented');
  }

  // ─── Tenant / user onboarding ──────────────────────────────────────────────

  // Register a tenant on the provider platform (e.g. Zoqq business customer).
  // Returns: { providerCustomerId, status, metadata }
  // Store result in: user_provider_identities (for the tenant admin user)
  async onboardTenant({ tenant }) {
    throw new Error('onboardTenant() must be implemented');
  }

  // Register an individual user on the provider platform.
  // Returns: { providerCustomerId, status, metadata }
  // Store result in: user_provider_identities
  async onboardUser({ user, tenant }) {
    throw new Error('onboardUser() must be implemented');
  }

  // ─── KYC delegation ────────────────────────────────────────────────────────

  // Submit KYC documents to the provider for verification.
  // Returns: { providerKycRef, status }
  // Status values: 'pending' | 'approved' | 'rejected'
  // Store result in: user_provider_identities (kyc_ref, kyc_status)
  async submitKyc({ user, documents, tenant }) {
    throw new Error('submitKyc() must be implemented');
  }

  // Poll provider for latest KYC status (used when provider has no webhook).
  // Returns: { providerKycRef, status, verifiedAt }
  async getKycStatus({ providerKycRef }) {
    throw new Error('getKycStatus() must be implemented');
  }

  // ─── Beneficiary sync ──────────────────────────────────────────────────────

  // Register a beneficiary on the provider platform (e.g. Zoqq counterparty).
  // Required by providers that pre-validate recipients before payment.
  // Returns: { providerBeneficiaryId, status, metadata }
  // Store result in: beneficiary_provider_refs
  async createBeneficiary({ beneficiary, user, tenant }) {
    throw new Error('createBeneficiary() must be implemented');
  }

  // Push local beneficiary updates to provider (name, banking detail changes).
  // Returns: { providerBeneficiaryId, status }
  async syncBeneficiary({ beneficiary, providerBeneficiaryId, user, tenant }) {
    throw new Error('syncBeneficiary() must be implemented');
  }

  // Remove a beneficiary from the provider platform.
  // Returns: { providerBeneficiaryId, status }
  async deleteBeneficiary({ providerBeneficiaryId }) {
    throw new Error('deleteBeneficiary() must be implemented');
  }

  // ─── FX ────────────────────────────────────────────────────────────────────

  // Fetch a live mid-rate without creating a locked quote.
  // Used for indicative display (rate cards, dashboards).
  // Returns: { sourceCurrency, targetCurrency, rate, timestamp }
  async getLiveRate({ sourceCurrency, targetCurrency }) {
    throw new Error('getLiveRate() must be implemented');
  }

  // ─── Reconciliation ────────────────────────────────────────────────────────

  // Fetch provider settlement report for a given date.
  // Returns: { date, matched: [], unmatched: [] }
  async getSettlementReport(date) {
    throw new Error('getSettlementReport() must be implemented');
  }

  // ─── Webhooks ──────────────────────────────────────────────────────────────

  // Verify that an inbound webhook came from this provider (HMAC / signature).
  // Returns: boolean
  verifyWebhookSignature(headers, rawBody) {
    throw new Error('verifyWebhookSignature() must be implemented');
  }

  // Normalise the raw webhook body into a standard event shape.
  // Returns: { eventType, paymentId, tenantId, ... }
  parseWebhook(headers, body) {
    throw new Error('parseWebhook() must be implemented');
  }
}
