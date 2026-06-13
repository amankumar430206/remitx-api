import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { v4 as uuidv4 } from 'uuid';
import { config } from './config/index.js';
import { tenantResolver } from './shared/middleware/tenantResolver.js';
import { requestLogger } from './shared/middleware/requestLogger.js';
import { errorHandler } from './shared/middleware/errorHandler.js';
import { authRouter } from './modules/auth/index.js';
import { tenantsRouter } from './modules/tenants/index.js';
import { accountsRouter } from './modules/accounts/index.js';
import { beneficiariesRouter } from './modules/beneficiaries/index.js';
import { fxRouter } from './modules/fx/index.js';
import { paymentsRouter } from './modules/payments/index.js';
import { complianceRouter } from './modules/compliance/index.js';
import { adminRouter } from './modules/admin/index.js';
import { notificationsRouter } from './modules/notifications/index.js';
import { reportingRouter } from './modules/reporting/index.js';
import { scheduledPaymentsRouter } from './modules/scheduledPayments/index.js';
import { webhookQueue } from './config/queues.js';
import db from './config/database.js';

const app = express();

app.set('trust proxy', 1);

app.use(helmet());
app.use(cors({
  origin: config.allowedOrigins,
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));

// Attach requestId to every request
app.use((req, res, next) => {
  req.id = uuidv4();
  res.setHeader('X-Request-Id', req.id);
  next();
});

app.use(requestLogger);

// Resolve tenant for all API routes
app.use('/api/v1', tenantResolver);

app.use('/api/v1/auth', authRouter);
app.use('/api/v1/tenants', tenantsRouter);
app.use('/api/v1/accounts', accountsRouter);
app.use('/api/v1/beneficiaries', beneficiariesRouter);
app.use('/api/v1/fx', fxRouter);
app.use('/api/v1/payments', paymentsRouter);
app.use('/api/v1/compliance', complianceRouter);
app.use('/api/v1/admin', adminRouter);
app.use('/api/v1/notifications', notificationsRouter);
app.use('/api/v1/reporting', reportingRouter);
app.use('/api/v1/scheduled-payments', scheduledPaymentsRouter);

// Webhook endpoints — no tenant resolver, no auth (verified per-provider)
const genericWebhookHandler = (provider) => async (req, res) => {
  const { eventId, eventType, paymentId, tenantId } = req.body;
  if (!eventId || !eventType || !paymentId || !tenantId) {
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Missing required webhook fields' } });
  }
  await webhookQueue.add('webhook.process', { provider, eventId, eventType, paymentId, tenantId }, {
    attempts: 5,
    backoff: { type: 'exponential', delay: 1000 },
  });
  res.json({ success: true });
};

// Zoqq webhook — verify platform x-api-key, find tenant by payout id, queue
app.post('/webhooks/zoqq', async (req, res) => {
  const incomingApiKey = req.headers['x-api-key'];
  if (!incomingApiKey || incomingApiKey !== config.zoqqApiKey) {
    return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid x-api-key' } });
  }

  const body = req.body;
  const ZOQQ_EVENT_MAP = {
    'payout.completed': 'payment.completed',
    'payout.failed':    'payment.failed',
    'payout.cancelled': 'payment.failed',
    'payout.rejected':  'payment.failed',
  };

  const rawEvent  = (body.event_type ?? body.eventType ?? '').toLowerCase();
  const eventType = ZOQQ_EVENT_MAP[rawEvent] ?? rawEvent;
  const eventId   = body.event_id ?? body.id ?? body.payout_id;
  const externalRef = body.payout_id ?? body.id;

  if (!eventId || !externalRef) {
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Cannot identify event or payout from Zoqq payload' } });
  }

  // Look up internal payment by provider reference — no tenant filter needed here
  // because provider_payment_id is globally unique (Zoqq generates it)
  const payment = await db('payments').where({ provider_payment_id: externalRef }).first();

  if (!payment) {
    // Acknowledge so Zoqq doesn't retry — may be from a different environment
    return res.json({ success: true });
  }

  await webhookQueue.add('webhook.process', {
    provider:  'zoqq',
    eventId,
    eventType,
    paymentId: payment.id,
    tenantId:  payment.tenant_id,
  }, { attempts: 5, backoff: { type: 'exponential', delay: 1000 } });

  res.json({ success: true });
});

app.post('/webhooks/cloudcurrency', genericWebhookHandler('cloudcurrency'));
app.post('/webhooks/dev', genericWebhookHandler('dev')); // no HMAC, local testing only

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use(errorHandler);

export default app;
