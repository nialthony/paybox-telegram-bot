# Changelog

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
