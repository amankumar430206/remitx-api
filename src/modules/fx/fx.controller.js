import * as service from './fx.service.js';
import { lockQuoteSchema } from './fx.validators.js';

export const getRates = async (req, res) => {
  const { rates, provider } = await service.getRatesForPairs(req.user.tenantId);
  res.json({ success: true, data: { rates, provider }, requestId: req.id });
};

export const createQuote = async (req, res) => {
  const { from, to, fromAmount } = await lockQuoteSchema.validateAsync(req.body, { abortEarly: false });
  const quote = await service.lockQuote(req.tenantId, from, to, fromAmount);
  res.status(201).json({ success: true, data: quote, requestId: req.id });
};

export const getQuote = async (req, res) => {
  const quote = await service.getQuoteById(req.params.id, req.tenantId);
  res.json({ success: true, data: quote, requestId: req.id });
};
