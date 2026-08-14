# Deployment Guide

> **Status:** Deployment is suitable for read-only portfolio access, payment-draft preparation, and service discovery. It is **not approved for live wallet-transfer requests or signing** until the required production controls in this document are complete.

## 1. Deployment decision

A Telegram bot needs a durable process and a shared state store. Choose one update-delivery model; do not run long polling and webhooks for the same bot token at the same time.[1]

| Model | Use when | Advantages | Required controls |
|---|---|---|---|
| **Single always-on long-polling worker** | Initial private beta or a single controlled deployment. | Lowest implementation complexity. | One active worker, managed secrets, PostgreSQL/Redis-backed state, restart policy, monitoring. |
| **HTTPS webhook service** | Production, multiple instances, managed ingress, or higher throughput. | Scales cleanly and avoids a permanent polling connection. | HTTPS, Telegram `secret_token` verification, idempotent update handling, shared state, health checks. |

The current code starts in long-polling mode. A webhook implementation should be added only alongside persistent payment intent storage and update deduplication.

## 2. Required production components

| Component | Required before public use | Reason |
|---|---:|---|
| Managed secret store | Yes | Keep Telegram, Paybox, OpenAI, and future webhook secrets outside source control. |
| Shared database | Yes | Persist payment drafts, idempotency keys, account links, audit IDs, and terminal states across restarts. |
| Shared rate limiter | Yes | Replace the current in-process limiter when running more than one instance. |
| Centralized structured logging | Yes | Monitor correlation IDs without logging message text, callback payloads, or secret values. |
| Health and readiness checks | Yes | Detect failed workers and configuration errors quickly. |
| Alerting | Yes | Notify operators of crash loops, error-rate spikes, and unexpected disabled/enabled transfer states. |
| External security review | Yes for wallet transfer enablement | Verify Paybox API contract, approval controls, persistence, input validation, and deployment hardening. |

## 3. Runtime configuration

Set secrets in the hosting platform’s secret manager, not in a committed `.env` file.

```dotenv
# Required
TELEGRAM_BOT_TOKEN=...
PAYBOX_API_KEY=...
DATABASE_URL=postgres://user:password@host:5432/paybox
RECONCILIATION_INTERVAL_MS=30000

# Optional, non-executing natural-language helper
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4o-mini

# Keep these disabled until all transfer gates are completed.
ENABLE_WALLET_TRANSFERS=false
PAYBOX_TRANSFER_ADAPTER_CONFIRMED=false
```

Do not configure `PAYBOX_SIGNING_KEY` in a public deployment while `/sign` remains gated. Rotate any token immediately if it is exposed in source control, CI logs, a terminal recording, or a Telegram message.

## 4. Pre-deployment validation

Run these checks in a clean build environment before every release:

```bash
npm ci
npm test
find src test -type f -name '*.js' -print0 | xargs -0 -n1 node --check
```

The repository’s GitHub Actions workflow runs the safety suite and syntax checks on pushes and pull requests. The PostgreSQL integration test runs when `TEST_DATABASE_URL` is supplied in a dedicated test environment. Add dependency and secret scanning before the first public beta.

## 5. Launch checklist

### Read-only / draft-only beta

- [ ] Configure `TELEGRAM_BOT_TOKEN` and `PAYBOX_API_KEY` through managed secrets.
- [ ] Leave wallet transfers and signing disabled.
- [ ] Create a private Telegram test group and restrict the bot’s exposure during initial validation.
- [ ] Verify `/start`, `/help`, `/balance`, `/pay`, `/transfer`, and `/services` with non-sensitive test accounts.
- [ ] Confirm that invalid amounts, unsupported assets, username recipients, and expired draft callbacks are rejected.
- [ ] Confirm that logs contain correlation IDs and metadata only—not user message bodies or provider errors.
- [ ] Configure uptime/error monitoring and a restart policy.

### Before enabling wallet transfers

- [ ] Verify that the installed Paybox SDK actually exposes the approved transfer operation and document its request/response contract.
- [ ] Verify the exact amount-unit contract in controlled staging/testnet tests for ETH and SOL.
- [ ] Deploy the PostgreSQL payment-intent schema with restricted runtime permissions. The bot runs the checked-in migration at startup and refuses production startup without `DATABASE_URL`.
- [ ] Confirm idempotency keys and the conditional database claim enforce one provider request per confirmed intent.
- [ ] Verify the durable reconciliation loop against the provider’s request-status contract; add an outbox-backed notification worker before promising Telegram status notifications.
- [ ] Build integration tests for approval, denial, timeout, provider error, duplicated callback, process restart, and duplicate Telegram update cases.
- [ ] Define a manual kill switch that stops new transfer creation without exposing configuration changes in chat.
- [ ] Complete an independent security review and record a formal launch approval.

## 6. Webhook hardening requirements

Telegram supports an optional `secret_token` that is delivered in the `X-Telegram-Bot-Api-Secret-Token` header for webhook requests.[1] A production webhook handler must:

1. Require HTTPS and verify the secret-token header using a constant-time comparison.
2. Persist and deduplicate `update_id` values before processing side effects.
3. Respond quickly, placing slow provider operations into durable jobs where appropriate.
4. Use a shared intent store so any instance can validate ownership and state safely.
5. Restrict allowed update types to those the bot needs, such as `message` and `callback_query`.
6. Expose non-sensitive `/healthz` and `/readyz` endpoints for the hosting platform.

## 7. Operational boundaries

- The bot must not log Telegram message bodies by default because they may contain wallet addresses, private business data, or messages intended for signature.
- Do not enable user-to-user transfers until recipient registration and verification are built. The hardened command flow currently accepts direct wallet addresses only.
- Keep x402 service use as discovery-only until service checkout has its own intent, approval, spending-limit, and audit workflow.
- Treat AI as assistance, not authorization. The current AI classifier may prepare guidance but cannot create money-moving requests.

## 8. Incident response

If you suspect misuse, provider-contract mismatch, or secret exposure:

1. Immediately disable new wallet-transfer requests through the deployment configuration and restart the worker.
2. Rotate exposed Telegram, Paybox, OpenAI, and webhook credentials.
3. Review Paybox request/audit history and correlation IDs from application logs.
4. Preserve relevant logs securely, without broadening access to sensitive user data.
5. Do not re-enable transfers until the root cause and corrective tests are documented.

## References

[1]: [Telegram Bot API — receiving updates and webhook secret tokens](https://core.telegram.org/bots/api#setwebhook)
