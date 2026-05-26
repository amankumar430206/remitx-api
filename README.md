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
All use workspace slug **`remitx`**.

| Email | Password | Role | KYC |
|-------|----------|------|-----|
| `admin@remitx.com` | `Admin@RemitX2024!` | super_admin | approved |
| `cadmin@remitx.com` | `Test@1234!` | client_admin | approved |
| `maker1@remitx.com` | `Test@1234!` | maker | approved |
| `maker2@remitx.com` | `Test@1234!` | maker | submitted (KYC queue) |
| `checker1@remitx.com` | `Test@1234!` | checker | approved |
| `checker2@remitx.com` | `Test@1234!` | checker | approved |
| `inactive@remitx.com` | `Test@1234!` | maker | pending · **inactive** |
| `suspended@remitx.com` | `Test@1234!` | maker | approved · **suspended** |
| `admin@acme.com` | `Test@1234!` | client_admin | approved (acme tenant) |
| `maker@acme.com` | `Test@1234!` | maker | approved (acme tenant) |

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
