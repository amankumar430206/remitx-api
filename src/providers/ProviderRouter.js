import { config } from '../config/index.js';
import redis from '../config/redis.js';
import { ManualAdapter } from './manual/ManualAdapter.js';
import { ZoqqAdapter } from './zoqq/ZoqqAdapter.js';
import { AppError } from '../shared/errors/AppError.js';
import {
  resolveProviderForCorridor,
  resolveGlobalProviderForCorridor,
  getTenantDefaultProvider,
  getTenantProviderCredentials,
} from '../modules/admin/admin.repository.js';

// Static registry for providers with platform-level credentials
const registry = new Map([
  ['manual', new ManualAdapter()],
]);

// Per-tenant Zoqq adapter cache (keyed by tenantId)
// Cleared when credentials are updated via admin API
const zoqqAdapterCache = new Map();

export const invalidateZoqqAdapter = (tenantId) => {
  zoqqAdapterCache.delete(tenantId);
};

const getZoqqAdapterForTenant = async (tenantId) => {
  if (zoqqAdapterCache.has(tenantId)) {
    return zoqqAdapterCache.get(tenantId);
  }
  const creds = await getTenantProviderCredentials(tenantId, 'zoqq');
  if (!creds) return null;

  const adapter = new ZoqqAdapter({ ...creds.config, tenant_id: tenantId });
  zoqqAdapterCache.set(tenantId, adapter);
  return adapter;
};

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
 */
export const resolveProviderName = async (tenantId, sourceCurrency, destCurrency) => {
  let name = await resolveProviderForCorridor(tenantId, sourceCurrency, destCurrency);

  if (!name) {
    name = await getTenantDefaultProvider(tenantId);
  }

  if (!name) {
    name = await resolveGlobalProviderForCorridor(sourceCurrency, destCurrency);
  }

  const resolved = name || config.defaultProvider || 'manual';

  // Zoqq is handled dynamically — don't fall back if it's explicitly configured
  if (resolved === 'zoqq') return 'zoqq';

  return registry.has(resolved) ? resolved : 'manual';
};

export const resolveProvider = async (tenantId, sourceCurrency, destCurrency) => {
  const cacheKey = `tenant:routing:${tenantId}:${sourceCurrency}:${destCurrency || 'any'}`;
  const cached = await redis.get(cacheKey);

  const resolvedName = cached ?? await resolveProviderName(tenantId, sourceCurrency, destCurrency);

  if (!cached) {
    await redis.setex(cacheKey, 300, resolvedName);
  }

  if (resolvedName === 'zoqq') {
    const adapter = await getZoqqAdapterForTenant(tenantId);
    if (adapter) return adapter;
    // Credentials not yet configured — fall back to manual silently
  }

  return registry.get(resolvedName) ?? registry.get(config.defaultProvider) ?? registry.get('manual');
};
