import { v4 as uuidv4 } from 'uuid';
import redis from '../../config/redis.js';
import { config } from '../../config/index.js';
import { logger } from '../../shared/utils/logger.js';
import { AppError } from '../../shared/errors/AppError.js';

// Platform token is shared — all tenants use the same Zoqq credentials for auth.
// Only x-user-id differs per tenant.
const PLATFORM_TOKEN_KEY = 'zoqq:platform:token';

export class ZoqqClient {
  constructor({ userId, tenantId }) {
    this.userId   = userId;
    this.tenantId = tenantId;
  }

  // ─── Auth ──────────────────────────────────────────────────────────────────

  async getToken() {
    const cached = await redis.get(PLATFORM_TOKEN_KEY);
    if (cached) return cached;

    const res = await fetch(`${config.zoqqBaseUrl}/api/v1/authentication/login`, {
      method: 'POST',
      headers: {
        'x-api-key':    config.zoqqApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_key:    config.zoqqClientKey,
        client_secret: config.zoqqClientSecret,
        email:         config.zoqqEmail,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      logger.error({ status: res.status, body }, 'Zoqq platform auth failed');
      throw new AppError('PROVIDER_AUTH_FAILED', 'Zoqq authentication failed', 502);
    }

    const data = await res.json();
    const token = data.access_token ?? data.accessToken ?? data.token;
    if (!token) throw new AppError('PROVIDER_AUTH_FAILED', 'Zoqq returned no access token', 502);

    // Cache for 50 min (tokens typically 60 min — leave buffer)
    await redis.setex(PLATFORM_TOKEN_KEY, 3000, token);
    return token;
  }

  async _clearToken() {
    await redis.del(PLATFORM_TOKEN_KEY);
  }

  // ─── Base request ─────────────────────────────────────────────────────────

  async request(method, path, body = null, idempotencyKey = null) {
    return this._doRequest(method, path, body, idempotencyKey, false);
  }

  async _doRequest(method, path, body, idempotencyKey, isRetry) {
    const token = await this.getToken();
    const url   = `${config.zoqqBaseUrl}${path}`;

    const headers = {
      'x-api-key':     config.zoqqApiKey,
      'x-product-id':  config.zoqqProductId,
      'x-user-id':     this.userId,
      'x-request-id':  idempotencyKey ?? uuidv4(),
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${token}`,
    };

    const options = { method, headers };
    if (body && method !== 'GET' && method !== 'DELETE') {
      options.body = JSON.stringify(body);
    }

    const res = await fetch(url, options);

    // Auto-refresh on 401 — once
    if (res.status === 401 && !isRetry) {
      await this._clearToken();
      return this._doRequest(method, path, body, idempotencyKey, true);
    }

    if (!res.ok) {
      let errBody;
      try { errBody = await res.json(); } catch { errBody = await res.text(); }
      logger.error({ status: res.status, url, errBody, tenantId: this.tenantId }, 'Zoqq API error');
      const message = errBody?.message ?? errBody?.error ?? `Zoqq API error ${res.status}`;
      throw new AppError('PROVIDER_ERROR', message, res.status >= 500 ? 502 : 422);
    }

    if (res.status === 204) return null;
    return res.json();
  }

  // ─── Webhook verification ─────────────────────────────────────────────────
  // Zoqq sends x-api-key matching the platform key on all webhook calls.
  verifyWebhookSignature(headers) {
    return headers['x-api-key'] === config.zoqqApiKey;
  }
}
