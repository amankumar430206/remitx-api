import { config } from '../config/index.js';
import redis from '../config/redis.js';
import { ManualAdapter } from './manual/ManualAdapter.js';
import { AppError } from '../shared/errors/AppError.js';
import { resolveProviderForCorridor } from '../modules/admin/admin.repository.js';

const registry = new Map([
  ['manual', new ManualAdapter()],
]);

export const getProvider = (name = config.defaultProvider) => {
  const provider = registry.get(name);
  if (!provider) {
    throw new AppError('INTERNAL_ERROR', `Unknown payment provider: ${name}`, 500);
  }
  return provider;
};

export const resolveProvider = async (tenantId, sourceCurrency, destCurrency) => {
  const cacheKey = `tenant:routing:${tenantId}:${sourceCurrency}:${destCurrency || 'any'}`;
  const cached = await redis.get(cacheKey);
  if (cached) {
    return registry.get(cached) ?? registry.get(config.defaultProvider) ?? registry.get('manual');
  }

  const providerName = await resolveProviderForCorridor(tenantId, sourceCurrency, destCurrency);
  const resolved = providerName || config.defaultProvider || 'manual';

  await redis.setex(cacheKey, 300, resolved);

  return registry.get(resolved) ?? registry.get(config.defaultProvider) ?? registry.get('manual');
};
