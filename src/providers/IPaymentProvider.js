export class IPaymentProvider {
  async getQuote({ sourceCurrency, targetCurrency, amount }) {
    throw new Error('getQuote() must be implemented');
  }

  async submitPayment({ payment, quote }) {
    throw new Error('submitPayment() must be implemented');
  }

  async getStatus({ externalRef }) {
    throw new Error('getStatus() must be implemented');
  }

  async cancelPayment({ externalRef }) {
    throw new Error('cancelPayment() must be implemented');
  }
}
