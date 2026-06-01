import { config } from '../config/index.js';
import redis from '../config/redis.js';
import { ManualAdapter } from './manual/ManualAdapter.js';
import { AppError } from '../shared/errors/AppError.js';
import {
  resolveProviderForCorridor,
  resolveGlobalProviderForCorridor,
  getTenantDefaultProvider,
} from '../modules/admin/admin.repository.js';

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

/**
 * Resolves the provider name string for a given tenant + currency corridor.
 * Resolution order:
 *   1. Tenant-specific corridor config
 *   2. Global (platform) corridor config
 *   3. DEFAULT_PROVIDER env var
 *   4. 'manual' fallback
 *
 * If the resolved name is not in the provider registry (e.g. 'zoqq' not yet
 * implemented), we gracefully fall back to 'manual' so payments never break.
 */
export const resolveProviderName = async (tenantId, sourceCurrency, destCurrency) => {
  // 1. Tenant-specific corridor (exact or source wildcard)
  let name = await resolveProviderForCorridor(tenantId, sourceCurrency, destCurrency);

  // 2. Tenant default provider (any corridor catch-all)
  if (!name) {
    name = await getTenantDefaultProvider(tenantId);
  }

  // 3. Global platform defaults
  if (!name) {
    name = await resolveGlobalProviderForCorridor(sourceCurrency, destCurrency);
  }

  // 4. Env default or hard fallback
  const resolved = name || config.defaultProvider || 'manual';

  // 4. If not in registry, use 'manual' (provider configured but not yet implemented)
  return registry.has(resolved) ? resolved : 'manual';
};

export const resolveProvider = async (tenantId, sourceCurrency, destCurrency) => {
  const cacheKey = `tenant:routing:${tenantId}:${sourceCurrency}:${destCurrency || 'any'}`;
  const cached = await redis.get(cacheKey);
  if (cached) {
    return registry.get(cached) ?? registry.get(config.defaultProvider) ?? registry.get('manual');
  }

  const resolved = await resolveProviderName(tenantId, sourceCurrency, destCurrency);
  await redis.setex(cacheKey, 300, resolved);

  return registry.get(resolved) ?? registry.get(config.defaultProvider) ?? registry.get('manual');
};
