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

// Map Zoqq lockPeriod enum → seconds for Redis TTL
const LOCK_PERIOD_SECONDS = {
  '5_mins':   5 * 60,
  '15_mins':  15 * 60,
  '1_hour':   60 * 60,
  '4_hours':  4 * 60 * 60,
  '8_hours':  8 * 60 * 60,
  '24_hours': 24 * 60 * 60,
};

export const lockQuote = async (tenantId, from, to, fromAmount, { quoteType, lockPeriod, conversionSchedule } = {}) => {
  const fromUpper = from.toUpperCase();
  const toUpper   = to.toUpperCase();

  const zoqqAdapter = await resolveZoqqAdapter(tenantId);

  let toAmount, rate, midRate, spread, providerQuoteId;
  let ttlSeconds = config.fxQuoteTtlSeconds;

  if (zoqqAdapter) {
    // Use Zoqq's quote API — locks the rate on their side and returns providerQuoteId.
    // Falls back to market rate if Zoqq is unreachable (e.g. IP not yet whitelisted).
    try {
      const zoqqResult = await zoqqAdapter.getQuote({
        sourceCurrency:    fromUpper,
        targetCurrency:    toUpper,
        amount:            fromAmount,
        quoteType,
        lockPeriod,
        conversionSchedule,
      });
      rate            = zoqqResult.rate;
      toAmount        = zoqqResult.destinationAmount ?? multiply(fromAmount, rate);
      providerQuoteId = zoqqResult.providerQuoteId;
      midRate         = rate;
      spread          = '0';
      ttlSeconds      = lockPeriod ? (LOCK_PERIOD_SECONDS[lockPeriod] ?? config.fxQuoteTtlSeconds) : config.fxQuoteTtlSeconds;
    } catch (zoqqErr) {
      // Zoqq unreachable — fall through to market rate so the flow isn't completely broken
      midRate  = await getLiveRate(fromUpper, toUpper);
      spread   = config.defaultFxSpread;
      rate     = applySpread(midRate, spread);
      toAmount = multiply(fromAmount, rate);
    }
  } else {
    // In-house market rate calculation
    midRate  = await getLiveRate(fromUpper, toUpper);
    spread   = config.defaultFxSpread;
    rate     = applySpread(midRate, spread);
    toAmount = multiply(fromAmount, rate);
  }

  const quoteId  = uuidv4();
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

  const quote = {
    quoteId,
    tenantId,
    from: fromUpper,
    to:   toUpper,
    fromAmount: String(fromAmount),
    toAmount:   String(toAmount),
    rate,
    midRate,
    spread: String(spread),
    expiresAt,
    // Zoqq-specific — only present when provider is Zoqq
    ...(providerQuoteId   && { providerQuoteId }),
    ...(quoteType         && { quoteType }),
    ...(lockPeriod        && { lockPeriod }),
    ...(conversionSchedule && { conversionSchedule }),
  };

  await redis.setex(`fxquote:${quoteId}`, ttlSeconds, JSON.stringify(quote));

  return {
    quoteId,
    from:       quote.from,
    to:         quote.to,
    fromAmount: quote.fromAmount,
    toAmount:   quote.toAmount,
    rate:       quote.rate,
    spread:     quote.spread,
    expiresAt:  quote.expiresAt,
    ...(quoteType          && { quoteType }),
    ...(lockPeriod         && { lockPeriod }),
    ...(conversionSchedule  && { conversionSchedule }),
  };
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
