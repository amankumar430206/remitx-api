import { v4 as uuidv4 } from 'uuid';
import redis from '../../config/redis.js';
import { config } from '../../config/index.js';
import { AppError } from '../../shared/errors/AppError.js';
import { applySpread, multiply } from '../../shared/utils/money.js';
import { resolveProviderName, resolveProvider } from '../../providers/ProviderRouter.js';

const COMMON_PAIRS = [
  ['USD', 'EUR'], ['USD', 'GBP'], ['USD', 'INR'], ['USD', 'AED'],
  ['USD', 'SGD'], ['USD', 'CAD'], ['USD', 'AUD'],
  ['EUR', 'USD'], ['EUR', 'GBP'], ['EUR', 'INR'],
  ['GBP', 'USD'], ['GBP', 'EUR'], ['GBP', 'INR'],
];

const fetchLiveRate = async (from, to) => {
  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${from}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.result !== 'success' || !data.rates?.[to]) {
      throw new Error('rate not found in response');
    }
    // Cache all rates from this response to maximise cache value
    const pipeline = redis.pipeline();
    for (const [toCur, rate] of Object.entries(data.rates)) {
      pipeline.setex(`fx:rate:${from}:${toCur}`, config.fxCacheTtlSeconds, String(rate));
    }
    await pipeline.exec();
    return String(data.rates[to]);
  } catch {
    return null; // fall through to ManualAdapter fallback
  }
};

export const getLiveRate = async (from, to) => {
  const cacheKey = `fx:rate:${from}:${to}`;
  const cached = await redis.get(cacheKey);
  if (cached) return cached;

  const live = await fetchLiveRate(from.toUpperCase(), to.toUpperCase());
  if (live) return live;

  // ManualAdapter fallback — hardcoded indicative rates
  const FALLBACK = {
    USD: { EUR: '0.92', GBP: '0.79', INR: '83.5', AED: '3.67', SGD: '1.35', CAD: '1.36', AUD: '1.53' },
    EUR: { USD: '1.09', GBP: '0.86', INR: '90.8', AED: '4.0',  SGD: '1.47', CAD: '1.48', AUD: '1.66' },
    GBP: { USD: '1.27', EUR: '1.17', INR: '106.3', AED: '4.66', SGD: '1.71', CAD: '1.72', AUD: '1.93' },
  };
  const rate = FALLBACK[from.toUpperCase()]?.[to.toUpperCase()] ?? '1.00000000';
  await redis.setex(cacheKey, config.fxCacheTtlSeconds, rate);
  return rate;
};

const fetchZoqqRate = async (adapter, from, to) => {
  const cacheKey = `fx:rate:zoqq:${from}:${to}`;
  const cached = await redis.get(cacheKey);
  if (cached) return cached;
  const result = await adapter.getLiveRate({ sourceCurrency: from, targetCurrency: to });
  const rate = String(result.rate);
  await redis.setex(cacheKey, config.fxCacheTtlSeconds, rate);
  return rate;
};

const resolveZoqqAdapter = async (tenantId) => {
  if (!tenantId) return null;
  try {
    const name = await resolveProviderName(tenantId, null, null);
    if (name !== 'zoqq') return null;
    const adapter = await resolveProvider(tenantId, null, null);
    return adapter?.name === 'zoqq' ? adapter : null;
  } catch {
    return null;
  }
};

export const getRatesForPairs = async (tenantId, pairs = COMMON_PAIRS) => {
  const zoqqAdapter = await resolveZoqqAdapter(tenantId);
  const provider = zoqqAdapter ? 'zoqq' : 'market';

  const rates = await Promise.all(
    pairs.map(async ([from, to]) => {
      let midRate;
      if (zoqqAdapter) {
        try {
          midRate = await fetchZoqqRate(zoqqAdapter, from, to);
        } catch {
          midRate = await getLiveRate(from, to);
        }
      } else {
        midRate = await getLiveRate(from, to);
      }
      const clientRate = applySpread(midRate, config.defaultFxSpread);
      return { from, to, midRate, clientRate };
    }),
  );

  return { rates, provider };
};

export const lockQuote = async (tenantId, from, to, fromAmount) => {
  const midRate = await getLiveRate(from.toUpperCase(), to.toUpperCase());
  const spread = config.defaultFxSpread;
  const clientRate = applySpread(midRate, spread);
  const toAmount = multiply(fromAmount, clientRate);

  const quoteId = uuidv4();
  const expiresAt = new Date(Date.now() + config.fxQuoteTtlSeconds * 1000).toISOString();

  const quote = {
    quoteId,
    tenantId,
    from: from.toUpperCase(),
    to: to.toUpperCase(),
    fromAmount: String(fromAmount),
    toAmount,
    rate: clientRate,
    midRate,
    spread: String(spread),
    expiresAt,
  };

  await redis.setex(
    `fxquote:${quoteId}`,
    config.fxQuoteTtlSeconds,
    JSON.stringify(quote),
  );

  return quote;
};

export const consumeFxQuote = async (quoteId, tenantId) => {
  const raw = await redis.get(`fxquote:${quoteId}`);
  if (!raw) throw new AppError('FX_QUOTE_EXPIRED', 'FX quote has expired or does not exist', 422);

  const quote = JSON.parse(raw);
  if (quote.tenantId !== tenantId) {
    throw new AppError('FX_QUOTE_INVALID', 'FX quote does not belong to this tenant', 422);
  }

  await redis.del(`fxquote:${quoteId}`);
  return quote;
};

export const getQuoteById = async (quoteId, tenantId) => {
  const raw = await redis.get(`fxquote:${quoteId}`);
  if (!raw) throw new AppError('FX_QUOTE_EXPIRED', 'FX quote has expired or does not exist', 404);

  const quote = JSON.parse(raw);
  if (quote.tenantId !== tenantId) {
    throw new AppError('FX_QUOTE_INVALID', 'FX quote does not belong to this tenant', 404);
  }

  return quote;
};
