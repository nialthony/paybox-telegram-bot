# Persistent Payment Intents and Reconciliation

## Purpose

The bot now supports a PostgreSQL-backed payment-intent store. It preserves the existing ownership, expiry, cancellation, and single-use confirmation rules while adding durable state across process restarts and multiple bot instances.

In production, `DATABASE_URL` is required. Without it, the application refuses to start when `NODE_ENV=production`. Local development and the existing dependency-free unit tests may continue to use the in-memory store.

## Schema

Migration `db/migrations/001_payment_intents.sql` creates two tables:

| Table | Role |
|---|---|
| `payment_intents` | Current draft, authorization state, idempotency key, provider request ID, provider status, expiry, and safe error code. |
| `payment_intent_events` | Append-only state-transition history for operational audit and reconciliation diagnostics. |

The `idempotency_key` is unique. Confirmation uses a conditional database update from `awaiting_confirmation` to `creating`, so concurrent Telegram callbacks can claim the same intent at most once. Ownership is checked against the immutable Telegram user ID and chat ID stored with the intent.

## Lifecycle

```text
awaiting_confirmation -> creating -> pending_approval -> succeeded
          |                   |              |
          v                   v              v
      cancelled            failed         failed
          |
       expired
```

Only pending approval requests with a provider request ID are eligible for reconciliation. The loop calls the narrow provider status adapter, validates the returned request ID, maps known Paybox statuses, and records the resulting transition. Unknown statuses and mismatched IDs are logged with safe error codes and do not mutate the intent.

## Configuration

Set the following values through managed runtime secrets or environment configuration:

```dotenv
NODE_ENV=production
DATABASE_URL=postgres://user:password@host:5432/paybox
RECONCILIATION_INTERVAL_MS=30000
```

The application runs the checked-in migration at startup. In a managed production environment, the database user should have only the permissions required to run the migration during deployment and to read/write these two tables at runtime. Use TLS for the database connection when the provider supports it.

## Test procedure

The normal test suite runs without external services:

```bash
npm ci --ignore-scripts
npm test
```

An optional PostgreSQL integration test runs when `TEST_DATABASE_URL` is set:

```bash
TEST_DATABASE_URL=postgres://user:password@host:5432/paybox_test npm test
```

Use a dedicated test database. The integration test deletes the rows it creates, but it must never receive a production database URL.

## Safety boundaries

This change does **not** enable wallet-transfer creation. The transfer gateway still fails closed unless the provider exposes both the verified creation method and the request-status method. It also does not send Telegram notifications from the reconciliation loop; user notification requires a separate durable notification/outbox design so a process restart cannot lose a status update.
