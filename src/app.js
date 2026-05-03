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

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use(errorHandler);

export default app;
