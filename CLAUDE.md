# CLAUDE.md — RemitX Project Bootstrap
# This file lives at the root of the project.
# Claude Code reads this automatically on every session start.

## Project Identity

Name: RemitX
Type: White-label cross-border payment platform
Architecture: Node.js ES6 modular monolith
Current phase: See CURRENT_PHASE below

## CURRENT_PHASE: 5
## CURRENT_PHASE_NAME: Payments Core + Maker-Checker

---

## Absolute Rules (Never Break)

1. ES6 modules only — `import/export`. Zero `require()`. Zero `module.exports`.
2. All imports include `.js` extension — `from './service.js'` not `from './service'`
3. `async/await` only — zero `.then()` chains, zero callbacks
4. All money arithmetic via `Big.js` — zero native float on financial values
5. Every DB query includes `tenant_id` filter — no exceptions, ever
6. Multi-table writes in DB transactions — `db.transaction(async trx => { ... })`
7. Only import from another module's `index.js` — never reach into module internals
8. `AppError` for all operational errors — never throw plain `Error` from handlers
9. Append-only tables (`ledger_entries`, `payment_status_history`, `audit_logs`) — never UPDATE these
10. No secrets or PII in log statements — ever

---

## Stack

```
Runtime:     Node.js >= 20 (ESM native)
Framework:   Express 5
DB:          PostgreSQL via Knex ORM
Cache/Queue: Redis via ioredis + BullMQ
Logging:     Winston (JSON structured)
Validation:  Joi (backend) / Zod (frontend)
Auth:        RS256 JWT + bcrypt + speakeasy TOTP
Money:       Big.js
Testing:     Jest + Supertest
Frontend:    React 18 + TypeScript + Vite + Tailwind + TanStack Query + Zustand
Mobile:      Expo React Native
```

---

## Project Structure

```
remitx-api/
├── CLAUDE.md                     ← this file
├── package.json                  ← "type": "module"
├── knexfile.js
├── .env.example
├── src/
│   ├── app.js                    ← Express setup
│   ├── server.js                 ← HTTP server + graceful shutdown
│   ├── config/
│   │   ├── index.js
│   │   ├── database.js
│   │   ├── redis.js
│   │   └── queues.js
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── index.js          ← public API exports
│   │   │   ├── auth.routes.js
│   │   │   ├── auth.controller.js
│   │   │   ├── auth.service.js
│   │   │   ├── auth.repository.js
│   │   │   ├── auth.validators.js
│   │   │   └── auth.test.js
│   │   └── tenants/
│   │       ├── index.js
│   │       ├── tenants.routes.js
│   │       ├── tenants.controller.js
│   │       ├── tenants.service.js
│   │       └── tenants.repository.js
│   ├── workers/
│   │   └── index.js
│   ├── providers/
│   │   ├── IPaymentProvider.js
│   │   ├── ProviderRouter.js
│   │   └── manual/
│   │       └── ManualAdapter.js
│   └── shared/
│       ├── middleware/
│       │   ├── authenticate.js
│       │   ├── authorize.js
│       │   ├── tenantResolver.js
│       │   ├── kycGuard.js       ← stub Phase 1 (always passes)
│       │   ├── idempotency.js
│       │   ├── rateLimiter.js
│       │   ├── requestLogger.js
│       │   └── errorHandler.js
│       ├── errors/
│       │   ├── AppError.js
│       │   └── errorCodes.js
│       └── utils/
│           ├── money.js
│           ├── crypto.js
│           ├── pagination.js
│           ├── audit.js
│           └── logger.js
├── db/
│   ├── migrations/
│   └── seeds/
└── tests/
    └── integration/
```

---

## Layer Responsibilities (Strict)

```
routes.js     → HTTP only. Middleware stack. Call controller. Nothing else.
controller.js → Extract req params. Call service. Format response. No logic.
service.js    → All business logic. Calls repository + other modules.
repository.js → All DB queries. Returns plain objects. No business logic.
validators.js → Joi schemas only.
index.js      → Public API exports only. No logic.
```

---

## Response Envelope (All Endpoints)

```json
// Success
{ "success": true, "data": {}, "meta": { "page": 1, "limit": 20, "total": 0 }, "requestId": "..." }

// Error
{ "success": false, "error": { "code": "ERROR_CODE", "message": "...", "details": [] }, "requestId": "..." }
```

---

## Key Patterns Reference

### AppError
```javascript
throw new AppError('NOT_FOUND', 'Payment not found', 404);
throw new AppError('INSUFFICIENT_BALANCE', 'Account balance insufficient', 422);
throw new AppError('SELF_APPROVAL', 'Maker cannot approve own payment', 403);
```

### DB query (always tenant-scoped)
```javascript
const row = await db('payments').where({ id, tenant_id: tenantId }).first();
```

### Transaction
```javascript
const result = await db.transaction(async (trx) => {
  const payment = await repo.create(data, trx);
  await repo.addHistory({ paymentId: payment.id }, trx);
  return payment;
});
```

### Money
```javascript
import { add, multiply, isGreaterThan } from '../../shared/utils/money.js';
const total = add(amount, fee);           // NOT: amount + fee
const converted = multiply(amount, rate); // NOT: amount * rate
```

### Route middleware stack
```javascript
router.post('/', authenticate, authorize('payments:create'), kycGuard, requireIdempotencyKey, ctrl.submit);
router.get('/', authenticate, authorize('accounts:view'), ctrl.list);
```

---

## Phase Completion Checklist

Before moving to next phase:
- [ ] All routes in phase spec implemented
- [ ] All tests passing (`npm test`)
- [ ] Migrations run cleanly (`npm run migrate`)
- [ ] Seeds run cleanly (`npm run seed`)
- [ ] No lint errors
- [ ] Committed to git

---

## How to Start Each Phase

Open new Claude Code session. Say:

```
Read CLAUDE.md. Current phase is [N].
Read the Phase [N] section in 02_PHASES.md.
Read 03_TECHNICAL_REFERENCE.md sections relevant to what I'm building.
Then build Phase [N] exactly as specified.
Do not modify code from previous phases unless Phase [N] explicitly requires it.
```