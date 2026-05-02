import { config } from '../config/index.js';
import { ManualAdapter } from './manual/ManualAdapter.js';
import { AppError } from '../shared/errors/AppError.js';

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

// Phase 2: always returns ManualAdapter.
// Phase 10 wires provider_corridor_configs table and real resolution logic.
export const resolveProvider = async (tenantId, sourceCurrency, destCurrency) => {
  return registry.get(config.defaultProvider) ?? registry.get('manual');
};
