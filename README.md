# remitx-api

REST API for the RemitX cross-border payment platform.
Node.js 20 · Express 5 · PostgreSQL · Redis · BullMQ

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | >= 20 |
| npm | >= 10 |
| Docker Desktop | latest |

---

## Infrastructure

Start PostgreSQL and Redis via Docker Compose:

```bash
docker compose up -d
```

| Service | Host | Credentials |
|---------|------|-------------|
| PostgreSQL 16 | `localhost:5432` | db: `remitx` · user: `remitx` · pass: `remitx_dev` |
| Redis 7 | `localhost:6379` | no password |

---

## Environment

```bash
cp .env.example .env
```

The defaults in `.env.example` work out of the box with the Docker services above.

### JWT keys

Generate an RSA-2048 key pair and place the files in `keys/`:

```bash
mkdir keys
openssl genrsa -out keys/private.pem 2048
openssl rsa -in keys/private.pem -pubout -out keys/public.pem
```

Set the paths in `.env`:

```env
JWT_PRIVATE_KEY_FILE=./keys/private.pem
JWT_PUBLIC_KEY_FILE=./keys/public.pem
```

> `keys/` is git-ignored. Never commit `.pem` files.

---

## Setup

```bash
npm install
npm run migrate   # run all DB migrations
npm run seed      # load test data (idempotent)
npm run dev       # dev server with --watch on port 3000
```

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server with file-watching (port 3000) |
| `npm start` | Production server |
| `npm test` | Jest test suite |
| `npm run test:coverage` | Jest with coverage report |
| `npm run migrate` | Run pending migrations |
| `npm run migrate:rollback` | Roll back last migration batch |
| `npm run migrate:make <name>` | Create a new migration file |
| `npm run seed` | Seed test data |

---

## Verify

```bash
curl http://localhost:3000/health
# → { "status": "ok" }
```

---

## Seed accounts

After `npm run seed` the following accounts are available.

### Workspace: `remitx` (default)

| Email | Password | Role | KYC | Status | Notes |
|-------|----------|------|-----|--------|-------|
| `admin@remitx.com` | `Admin@RemitX2024!` | super_admin | approved | active | |
| `cadmin@remitx.com` | `Test@1234!` | client_admin | approved | active | |
| `maker1@remitx.com` | `Test@1234!` | maker | approved | active | Primary maker |
| `maker2@remitx.com` | `Test@1234!` | maker | submitted | active | KYC queue |
| `maker3@remitx.com` | `Test@1234!` | maker | approved | active | Secondary maker |
| `checker1@remitx.com` | `Test@1234!` | checker | approved | active | |
| `checker2@remitx.com` | `Test@1234!` | checker | approved | active | |
| `kyc3@remitx.com` | `Test@1234!` | maker | submitted | active | KYC queue |
| `kyc4@remitx.com` | `Test@1234!` | maker | submitted | active | KYC queue |
| `inactive@remitx.com` | `Test@1234!` | maker | pending | **inactive** | |
| `suspended@remitx.com` | `Test@1234!` | maker | approved | **suspended** | |

### Other workspaces

| Email | Password | Workspace | Role | Status |
|-------|----------|-----------|------|--------|
| `admin@acme.com` | `Test@1234!` | acme-corp | client_admin | active |
| `maker@acme.com` | `Test@1234!` | acme-corp | maker | active |
| `checker@acme.com` | `Test@1234!` | acme-corp | checker | active |
| `admin@globalpay.com` | `Test@1234!` | globalpay | client_admin | active |
| `maker@globalpay.com` | `Test@1234!` | globalpay | maker | active |
| `admin@sterling.com` | `Test@1234!` | sterling-money | client_admin | active · tenant **suspended** |
| `admin@paybridge.com` | `Test@1234!` | paybridge | client_admin | active · tenant **inactive** |
| `admin@fintechv.com` | `Test@1234!` | fintech-ventures | client_admin | active · tenant **pending** |

### Investor-demo data at a glance

| Category | Count | Details |
|----------|-------|---------|
| Tenants | 6 | active ×3, suspended ×1, inactive ×1, pending ×1 |
| Users | 19 | across all tenants, all roles and statuses |
| Accounts | 6 | USD $1.2M cap, GBP £150K, EUR €250K, AED 750K |
| Beneficiaries | 12 | cleared ×9, pending ×2, flagged ×1 |
| Payments | 62 | completed ×45, pending_approval ×4, manual_queue ×3, approved ×1, rejected ×4, failed ×3, cancelled ×2 |
| KYC queue | 3 | submitted (maker2, kyc3, kyc4) |
| Reconciliation | 30 days | 3 days with exceptions |
| Fee configs | 8 | per-corridor + wildcard fallback |
| Notifications | 19 | across super_admin, maker1, maker3, checker1 |

---

## Troubleshooting

**`NOAUTH Authentication required` on startup**
Another Redis container from a different project is occupying port 6379 with a password.
Stop it first, then start the remitx Redis:
```bash
docker stop <other-container>
docker compose up -d redis
```

**`npm run migrate` fails — relation does not exist**
Ensure the Postgres container is running before migrating:
```bash
docker compose up -d postgres
npm run migrate
```

**JWT errors on startup**
Re-run the `openssl` commands above and verify the `.env` paths point to the correct `.pem` files.
