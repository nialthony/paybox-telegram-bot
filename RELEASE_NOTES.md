# v2.1.0 — Reliability, confirmations & automation

The trust-and-automation release: payments that survive restarts, transactions followed to on-chain finality, an explicit ✅ before any AI-initiated money move, group expense splits, and a command scheduler whose every run still passes your normal approvals. The bot stays fully non-custodial — nothing below changes where keys live or who approves money.

## Highlights

### 🛡 Reliability & trust (do-first)

- **Crash-safe resume** — a restart no longer orphans a payment. In-flight
  requests (including those parked at `pending_approval`) are persisted and
  picked back up on boot, continuing on the same Telegram message: approval →
  in-process signature → broadcast → confirmation. Requests that outlive the
  approval window are watched in the background for up to 24h.
- **Tx confirmation watcher** — "broadcast" ≠ "done". Status messages now
  live-edit through on-chain finality with explorer links:
  `📡 broadcast → ✅ included (n/12 confirmations) → 🔒 final`, and clearly
  report reverted / failed transactions (Ethereum, Base, Solana).
- **Confirm-before-send in AI mode** — chat-initiated money moves show the
  exact command about to run and wait for a one-tap **✅ Confirm / ✏️ Change /
  ❌ Cancel**. Bound to the asking user; expires in 90s; nothing moves without
  the tap.

### 🚀 High impact

- **Group expense splitter** — `/split 0.09 ETH team lunch @alice @bob`:
  even shares with exact fixed-point math (payer absorbs dust), balances via
  `/split status`, real settlement via `/split settle` (a normal `/transfer`
  → approvals apply), out-of-band marking via `/split paid`, `/split cancel`.
- **Command scheduler** — `/schedule add every 6h /price ETH`,
  `/schedule add daily 09:00 /balance` (`SCHEDULER_TZ`). Durable jobs,
  restart-safe, no catch-up herds after downtime — and **every scheduled run
  goes through the same dispatcher and passkey approvals** as a hand-typed
  command. A scheduled transfer asks for approval each time it fires.
  `/schedule list · pause · resume · cancel`; `/schedule` is not schedulable.

### 🧱 Engineering

- New crash-safe atomic stores: `pending.json`, `splits.json`, `jobs.json`
- `/healthz` now reports pending requests, scheduled jobs and active tx watchers
- Graceful shutdown stops scheduler, pollers, tx watchers, background
  approval watchers and confirmation cards
- 79 unit tests (`npm test`), up from 32 — zero native dependencies
- New optional env vars: `AGENT_CONFIRM_TIMEOUT_MS`, `TX_CONFIRM_TIMEOUT_MS`,
  `SCHEDULER_TICK_MS`, `SCHEDULER_TZ` (see `.env.example`)

## Upgrade notes

- Drop-in replacement for v2.0.0 — no breaking changes, no new required config.
- Requires Node 18+ and `@paybox-sh/sdk ^0.8.5` as before.
- Existing data (address book, stats) is untouched; new stores are created on
  first run.

## Security model

Unchanged and non-negotiable: the bot never sees private keys, card PANs or
raw secrets. Signing happens in MoonX MPC; `always_approve` credentials pause
for your passkey — including on every scheduled run; virtual cards and payment
tokens stay single-use; every request remains in your Paybox audit log and
`/history`. The scheduler and AI mode are front doors to the *same* validated
pipeline, never a bypass.

**Full changelog**: see [CHANGELOG.md](CHANGELOG.md) and
[compare v2.0.0...v2.1.0](https://github.com/nialthony/paybox-telegram-bot/compare/v2.0.0...v2.1.0)
