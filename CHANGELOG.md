# Changelog

## v2.1.1 — Security hardening

**Security fixes (H3, H2, H1, M2, M3, L-batch):**

- **H3 — Webhook forgery protection** (`src/index.js`, `src/config.js`):
  - New env var `BOT_WEBHOOK_SECRET` — passed as Telegraf's `secretToken` launch option. Telegram then sends `X-Telegram-Bot-Api-Secret-Token` on every webhook call and Telegraf verifies it.
  - Bot **refuses to start** in webhook mode when `BOT_WEBHOOK_SECRET` is missing.
  - Logs a warning when `BOT_WEBHOOK_PATH` is the default `/webhook` — recommends a randomized path (e.g. `/webhook-<random>`) to reduce probing.
  - Updated `.env.example` and `DEPLOYMENT.md`.

- **H2 — Address-book poisoning protection** (`src/commands/register.js`, `src/store/registry.js`):
  - `/register` may only bind a handle matching the caller's own Telegram username, unless caller is owner (`OWNER_TELEGRAM_ID`) — owner may register anyone.
  - Never silently overwrites: requires explicit `--force` flag and shows old → new address in confirmation.
  - `/unregister` enforces same own-handle policy.

- **H1 — Open-deployment exposure lock** (`src/middleware/index.js`, `src/agent/index.js`, `src/config.js`):
  - When `OWNER_TELEGRAM_ID` is unset, logs loud startup warning.
  - Blocks money + sensitive commands (`transfer`, `swap`, `pay`, `use_service`, `sign`, `secret`, `split settle`, `schedule`) unless `PAYBOX_OPEN_MODE=1` is explicitly set.
  - Read-only commands (`balance`, `markets`, `help`…) stay open. AI-mode money intents also blocked under same gate.

- **M2 — AI-mode gates expanded** (`src/utils/confirm.js`, `src/agent/index.js`):
  - `secret` and `sign` added to confirm-before-send set (`SENSITIVE_INTENTS`), so NL-triggered secret reveals and message signings also require one-tap ✅ card.
  - `MONEY_INTENTS` kept for backward compat (4 items); new `SENSITIVE_INTENTS` is 6 items.

- **M3 — Splits authorization by immutable user id** (`src/commands/split.js`, `src/store/splits.js`):
  - Payer actions (`markPaid`, `cancel`) and settle-payee identity authorized by Telegram user id (`createdBy` / `payer.userId`), not mutable username. Usernames are display-only.
  - Payer address captured at creation time when available; settlement prefers stored address over registry lookup by handle to prevent username-hijack.
  - Store persists `payer.userId` and `payer.address` plus participant `userId` for payer.

- **Low-severity batch**:
  - **L1**: `__proto__`/`constructor`/`prototype` rejected as registry handles (prototype-pollution guard, safe `hasOwnProperty` checks).
  - **L2**: `escapeMd()` on user-controlled text interpolated into Markdown (split descriptions, `/pay` merchant names, service names).
  - **L4**: `/schedule cancel|pause|resume` checks `job.userId === ctx.from.id` (or caller is owner), not just chat.
  - **L6**: Persist tx id to pending store **before** broadcasting, so crash between broadcast and untrack can't cause re-broadcast on resume; resume detects existing txId and jumps to watcher.

**Tests & tooling:**

- 94 tests (`npm test`) — 79 original green + 15 new focused security tests (registry poisoning, owner/open-mode gating, webhook-secret validation, splits authz by user id, escapeMd, schedule authz, pending txId persistence).
- `npm run check` clean.
- New env vars: `BOT_WEBHOOK_SECRET`, `PAYBOX_OPEN_MODE` (see `.env.example`).

**Upgrade notes:** drop-in, no breaking changes except webhook mode now **requires** `BOT_WEBHOOK_SECRET`. Set it with `openssl rand -hex 32`. If you run an open bot intentionally, set `PAYBOX_OPEN_MODE=1` or lock with `OWNER_TELEGRAM_ID`.

## v2.1.0 — Reliability, confirmations & automation

**Do-first reliability & trust:**

- **Crash-safe resume** — in-flight transfer requests (including ones parked at
  `pending_approval`) are persisted to a durable `pending.json` store. A bot
  restart picks them back up, re-uses the status message already on screen,
  re-checks the Paybox request, finishes the in-process signature, broadcasts
  and watches the confirmation — exactly where it left off. Requests that
  outlive the approval window keep being watched in the background (up to 24h)
  instead of being orphaned.
- **On-chain confirmation watcher** — "broadcast" is no longer "done". Every
  broadcast transaction is followed to on-chain finality with live message
  edits: `📡 broadcast → ✅ included (block, n/12 confirmations) → 🔒 final`,
  with explorer links (Etherscan / Basescan / Solscan) the whole way. Reverted
  and failed transactions are reported as such.
- **Confirm-before-send in AI mode** — natural-language money moves
  (`transfer`, `swap`, `pay`, `use_service`) are never executed straight
  away. The bot shows exactly which command it is about to run and waits for a
  one-tap ✅ Confirm / ✏️ Change / ❌ Cancel (bound to the asking user,
  expiring after `AGENT_CONFIRM_TIMEOUT_MS`, default 90s).

**High impact:**

- **Group expense splitter** — `/split 30 ETH team lunch @alice @bob` records
  an expense the creator paid and splits it evenly (the payer absorbs division
  dust; shares use exact fixed-point math, never floats). `/split settle`
  pays your share with a real `/transfer` (normal approvals apply);
  `/split paid` marks out-of-band settlements; `/split status`, `/split cancel`.
- **Command scheduler** — `/schedule add every 6h /price ETH` and
  `/schedule add daily 09:00 /balance` (timezone via `SCHEDULER_TZ`). Jobs are
  durable, survive restarts, run once after downtime (rescheduled from "now",
  never a catch-up herd), and **every execution goes through the normal
  dispatcher** — validation and passkey approvals included, so a scheduled
  transfer still asks for your approval each time it fires. `/schedule
  list · pause · resume · cancel` manage jobs; `/schedule` itself is not
  schedulable (recursion guard).

**Engineering:** 79 unit tests (`npm test`, was 32), zero native dependencies
unchanged; new atomic JSON stores (`pending.json`, `splits.json`, `jobs.json`);
`/healthz` now reports pending requests, scheduled jobs and active tx
watchers; graceful shutdown stops the scheduler, pollers, watchers and
confirmation cards.

**Upgrade notes:** nothing breaking — drop-in replacement. New optional env
vars: `AGENT_CONFIRM_TIMEOUT_MS`, `TX_CONFIRM_TIMEOUT_MS`,
`SCHEDULER_TICK_MS`, `SCHEDULER_TZ` (see `.env.example`).

## v2.0.0 — Paybox SDK 0.8.5 rebuild

Full rebuild on `@paybox-sh/sdk` 0.8.5 and the official Paybox REST surface
(no MCP host required): `/balance`, `/transfer`, `/swap` (+ bridges),
`/buy`, `/pay`, `/sign`, `/secret`, `/services` + `/use_service` (x402),
prediction markets (`/markets`, `/market`, `/orderbook`, `/price`,
`/positions`), `/perp`, AI agent mode mapped onto the same validated command
functions, headless signing protocol (`/binding` → `/moonx-sign` →
`/signature`), owner lock, DM-only mode, rate limiting, webhook or long
polling with `/healthz`, Docker with healthcheck, 32 unit tests.

Full notes: see the [v2.0.0 release](https://github.com/nialthony/paybox-telegram-bot/releases/tag/v2.0.0).
