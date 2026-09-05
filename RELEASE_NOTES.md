# v2.0.0 — Paybox SDK 0.8.5 rebuild

Full rebuild of the Paybox Telegram Bot on **`@paybox-sh/sdk` 0.8.5** and the official Paybox REST surface — no MCP host required. Every money operation is passkey-approved or bounded by your Paybox grant; the bot remains fully non-custodial.

## Highlights

### 💸 Wallet & money movement
- `/balance` — portfolio across all granted wallets (holdings, USD totals, 24h change)
- `/transfer` — on-chain transfers on Ethereum, Base and Solana, with `@handle` resolution from the address book
- `/swap` — token swaps **and cross-chain bridges** via MoonX routing
- `/buy` — signed MoonPay fiat checkout links
- `/pay` — merchant-scoped **one-time virtual cards** from a card credential
- `/sign` — EIP-191 / EIP-712 / Solana message signatures; private keys never leave MoonX MPC
- `/secret` — reveal scoped secret credentials (one-time tokens, raw mode with a raw grant)

### 🛒 Services & markets
- `/services` + `/use_service` — browse and pay for curated **x402** services
- `/markets`, `/market`, `/orderbook`, `/price`, `/positions` — prediction markets with books and 7-day sparkline charts
- `/perp` — Hyperliquid market data

### 🧠 AI agent mode
- Natural-language DMs mapped to the **same validated command functions** as slash commands (set `OPENAI_API_KEY`) — nothing the model decides bypasses validation or approval flows
- Per-user conversation memory (last 6 turns)

### 🛡️ Safety & engineering
- Headless signing protocol re-implemented on the SDK (`/binding` → `/moonx-sign` → `/signature`) — passkey approvals complete without an iframe
- Full approval lifecycle with live message edits: `pending_approval` → approval link → poll → in-process signing → broadcast → on-chain confirmation
- Owner lock, DM-only mode, per-user rate limiting, secret redaction in all logs, crash-safe atomic JSON stores
- Long-polling **or** webhook mode with `/healthz`, graceful shutdown, Docker image with healthcheck
- 32 unit tests (`npm test`), zero native dependencies

## Upgrade notes

- Requires **Node 18+** and `@paybox-sh/sdk ^0.8.5` (see `package.json`)
- Copy `.env.example` → `.env` and re-check your Paybox grants in the app after upgrading
- Docker: `docker compose up -d --build` (see `DEPLOYMENT.md`)

## Security model

Non-custodial by construction: the bot never sees private keys, card PANs or raw secrets. Signing happens in MoonX MPC; `always_approve` credentials pause for your passkey; virtual cards and payment tokens are single-use. Every request is visible in your Paybox audit log and in `/history`.

**Full changelog**: https://github.com/nialthony/paybox-telegram-bot/compare/9776330...v2.0.0
