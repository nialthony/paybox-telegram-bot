# Paybox Telegram Bot

A Telegram companion for **read-only portfolio checks**, **validated payment drafts**, **message-signing guidance**, and **x402 service discovery**. The bot is designed around Paybox credentials and approvals, but it deliberately keeps high-risk wallet transfers disabled until the installed SDK contract has been independently verified in a controlled environment.

> **Current release posture: hardened prototype.** The repository now has safe payment parsing, recipient validation, explicit Telegram confirmation controls, AI draft-only behavior, rate limiting, redacted errors, and a test baseline. It is **not approved for mainnet wallet transfers** until the transfer adapter, persistent state, webhook handling, and external security review are complete.

## What is available now

| Capability | Status | Notes |
|---|---|---|
| `/balance [wallet_address]` | Available | Read-only portfolio view through Paybox; provide an address if Paybox credential metadata does not expose one. |
| `/pay <wallet_address> <amount> <ETH|SOL>` | Draft available | Validates address, amount, and asset; shows a user-owned confirmation card. |
| `/transfer` | Legacy alias | Uses the same draft flow as `/pay`; no duplicate transfer implementation remains. |
| Wallet-transfer request creation | Disabled by default | Requires explicit adapter confirmation and controlled integration tests before enablement. |
| `/sign <message>` | Temporarily disabled | No signature request is created until a persistent confirmation/status workflow is implemented. |
| `/services [query]` | Discovery only | Shows available services; service checkout is not enabled. |
| Natural-language helper | Optional, draft-only | It may explain features or prepare guidance but never creates transfers, signatures, or payment requests. |

## Safety model

The bot treats financial actions as high-risk operations. It applies the following safeguards:

1. **Asset allowlist and exact units.** Only native ETH and SOL are accepted. Amounts are parsed as decimal strings and converted with `BigInt`; the bot never uses floating-point arithmetic for an on-chain amount. ETH uses 18 decimal places (wei), while SOL uses 9 decimal places (lamports).[1] [2]
2. **Address validation.** Ethereum and Solana destination addresses are checked before a payment draft is created.
3. **Explicit confirmation.** A payment draft records the Telegram user ID, chat ID, expiry time, and requested details. Only the originating user in the originating chat can confirm or cancel it.
4. **AI cannot execute.** Natural-language output is limited to `balance`, `payment_draft`, `services`, and `chat`. The bot never maps AI text directly to a money-moving command.
5. **Transfers fail closed.** `ENABLE_WALLET_TRANSFERS=false` is the default. An attempt to enable transfers without `PAYBOX_TRANSFER_ADAPTER_CONFIRMED=true` prevents startup.
6. **Redacted errors and logs.** Users receive a correlation reference rather than raw provider or implementation errors. Update logs omit message text and callback payloads.
7. **Basic abuse protection.** The in-process limiter allows 20 updates per user per minute. Production deployment must replace this with a shared store.

## Architecture

```mermaid
flowchart TD
    T[Telegram update] --> M[Middleware: error boundary, rate limit, redacted logging]
    M --> C[Command router]
    C --> B[/balance: read-only Paybox query]
    C --> D[/pay: validate and create local draft]
    D --> I[Payment intent: PostgreSQL in production, memory in local development]
    I --> X[Explicit callback confirmation]
    X --> G[Disabled-by-default Paybox transfer gateway]
    C --> A[AI classifier: draft-only]
    A --> C
    C --> S[/services: discovery only]
```

## Prerequisites

| Requirement | Version | Purpose |
|---|---:|---|
| Node.js | 20 or newer | Runtime and built-in test runner. |
| Telegram bot token | — | Receives bot updates. |
| Paybox API key | — | Reads credentials and portfolio data. |
| PostgreSQL | 14 or newer | Durable payment intents and reconciliation state in production. |
| Optional OpenAI API key | — | Enables natural-language guidance only. |

## Setup

```bash
git clone https://github.com/nialthony/paybox-telegram-bot.git
cd paybox-telegram-bot
npm ci
cp .env.example .env
```

Set the required variables in `.env`:

```dotenv
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
PAYBOX_API_KEY=pbx_live_your_auth_token_here
DATABASE_URL=postgres://paybox:replace-me@localhost:5432/paybox
RECONCILIATION_INTERVAL_MS=30000
ENABLE_WALLET_TRANSFERS=false
```

Start the bot with long polling:

```bash
npm start
```

For local development with restart-on-change:

```bash
npm run dev
```

## Self-deploy with Docker Compose

The repository includes a self-contained Docker Compose deployment with a non-root bot container, PostgreSQL, a durable database volume, a database health check, and automatic schema initialization. Docker Compose is the simplest independent deployment path for a single host.

Install [Docker Engine](https://docs.docker.com/engine/install/) with the [Compose v2 plugin](https://docs.docker.com/compose/install/linux/) on an Ubuntu server or another supported host. Then run:

```bash
git clone https://github.com/nialthony/paybox-telegram-bot.git
cd paybox-telegram-bot
cp .env.docker.example .env
chmod 600 .env
# Edit .env and replace every placeholder, especially the Telegram token,
# Paybox API key, and PostgreSQL password.
nano .env
docker compose --env-file .env config --quiet
docker compose up -d --build
docker compose ps
docker compose logs -f bot
```

The bot container waits for PostgreSQL to become healthy, passes `DATABASE_URL` internally, and runs the checked-in payment-intent migration at startup. A successful startup should show the bot process without a configuration error. Keep `ENABLE_WALLET_TRANSFERS=false` and `PAYBOX_TRANSFER_ADAPTER_CONFIRMED=false` for every first deployment.

For updates, pull the new code and rebuild the image without deleting the database volume:

```bash
git pull --ff-only
docker compose up -d --build
```

Create a database backup before upgrades or host maintenance. This command writes the dump to the host and does not print the database password:

```bash
mkdir -p backups
docker compose exec -T postgres sh -lc 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > "backups/paybox-$(date -u +%Y%m%dT%H%M%SZ).sql"
```

To stop the services while preserving data, use `docker compose down`. Do **not** use `docker compose down -v` unless you intentionally want to delete the PostgreSQL volume and all stored payment intents and audit events. Review logs with `docker compose logs --since=1h bot postgres`, and verify that the host protects `.env` and the `backups/` directory.

The Docker deployment is suitable for read-only and draft-only staging. It is not an approval to enable live wallet transfers. Before enabling money movement, complete the provider-contract, staging, reconciliation, rate-limit, kill-switch, dependency, monitoring, and independent security-review gates in `DEPLOYMENT.md`.

## Environment configuration

| Variable | Required | Safe default | Purpose |
|---|---:|---|---|
| `TELEGRAM_BOT_TOKEN` | Yes | — | Telegram bot authentication. |
| `PAYBOX_API_KEY` | Yes | — | Paybox API authentication. |
| `DATABASE_URL` | Production | — | PostgreSQL connection for durable payment intents; production startup rejects its absence. |
| `RECONCILIATION_INTERVAL_MS` | No | `30000` | Minimum 5-second interval for provider request reconciliation. |
| `PAYBOX_SIGNING_KEY` | No | Unset | High-sensitivity signing key; do not configure until the signing flow is production-ready. |
| `OPENAI_API_KEY` | No | Unset | Enables non-executing natural-language assistance. |
| `OPENAI_MODEL` | No | `gpt-4o-mini` | AI classifier model. |
| `ENABLE_WALLET_TRANSFERS` | No | `false` | Enables transfer adapter only after verification. |
| `PAYBOX_TRANSFER_ADAPTER_CONFIRMED` | Conditional | `false` | Must be `true` with transfer enablement after verified integration testing. |

Never commit `.env` files, deploy secrets in client code, or send secret values in Telegram messages.

## Commands

| Command | Description |
|---|---|
| `/start` | Explain the current capability and safety posture. |
| `/help` | Display the supported command set. |
| `/balance [wallet_address]` | Show a Paybox portfolio; pass a wallet address when it cannot be inferred from credential metadata. |
| `/pay <address> <amount> <ETH|SOL>` | Create a validated, expiring payment draft. |
| `/transfer <address> <amount> <ETH|SOL>` | Legacy alias of `/pay`. |
| `/sign <message>` | Displays the current signing safety gate; no request is created. |
| `/services [query]` | Discover services without initiating checkout. |

## Quality checks

The repository uses Node’s built-in test runner so core safety controls can be tested without calling Telegram, Paybox, or an LLM.

```bash
npm run check
```

The suite covers exact ETH/SOL conversions, unsupported input rejection, ownership and expiry of payment drafts, AI intent restrictions, configuration guards, rate limiting, the transfer-adapter gate, provider-status mapping, and reconciliation failure isolation. The PostgreSQL integration test is skipped unless `TEST_DATABASE_URL` is provided. Run `npm run db:migrate` with `DATABASE_URL` to initialize the schema explicitly. GitHub Actions runs the dependency-free checks for pushes and pull requests to `main`.

## Before enabling mainnet wallet transfers

Do **not** change the transfer flags solely to test a live transfer. Complete each item below first.

1. Verify the installed `@paybox-sh/sdk` transfer operation and its exact amount-unit contract from official SDK documentation or Paybox support. The current SDK documentation exposes payment, signing, swap, service, and request-status operations; the source adapter stays disabled until the wallet-transfer method is confirmed.[3]
2. Deploy the PostgreSQL persistence adapter with restricted database permissions for payment intents, idempotency keys, state transitions, and audit events. In-memory Maps are not safe across restarts or multiple instances.
3. Use the durable reconciliation worker for provider request-status changes, then add provider webhooks or an outbox-backed notification worker when user notifications are required. Telegram webhook endpoints should verify Telegram’s `secret_token` header and process updates idempotently.[4]
4. Build controlled staging/testnet integration tests for the actual Paybox API contract, including approvals, denials, retries, timeouts, and duplicate Telegram updates.
5. Add shared rate limiting, monitored audit logs, secret scanning, dependency scanning, and an emergency kill switch.
6. Complete an independent application-security review and a controlled mainnet launch checklist before allowing users to create transfer requests.

## Deployment approaches

A Telegram bot must remain reachable for updates. Two viable deployment approaches are:

| Approach | Tradeoffs | Cost | Setup complexity |
|---|---|---|---|
| **Managed HTTPS service with Telegram webhooks** | Suitable for a production API, shared database, verified webhooks, and horizontal scaling. Requires a secure secret configuration and persistent data service. | Starts low and varies by usage. | Moderate. |
| **Single always-on worker using long polling** | Simpler initial operational model, but needs durable state and one active worker. Less flexible for scale-out. | Depends on the host’s always-on runtime. | Lower. |

For production, choose one model, persist all intents outside process memory, and ensure only one consumer handles each update or that updates are deduplicated by Telegram update ID.

## Contributing

1. Create a focused branch.
2. Do not add a new user-visible command until it has a registered handler, a documented status, and automated tests.
3. Keep money-moving logic inside the transaction domain and provider adapter; never duplicate amount conversion or provider polling in command files.
4. Run `npm test` and the syntax check before opening a pull request.
5. Do not merge changes that weaken default-deny behavior for transfers or signing without documented security review.

## References

[1]: [Ethereum — technical introduction to ether and wei](https://ethereum.org/en/developers/docs/intro-to-ether/)
[2]: [Solana terminology — lamport](https://solana.com/docs/references/terminology#lamport)
[3]: [Paybox SDK and CLI documentation](https://docs.paybox.sh/sdk-cli)
[4]: [Telegram Bot API — webhooks and secret tokens](https://core.telegram.org/bots/api#setwebhook)
