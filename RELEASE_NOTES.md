# v2.1.1 — Security hardening (webhook secret token, address-book protections, owner-lock enforcement)

This is a security patch release — no new features, only hardening of who can ask and where answers go. The money pipeline's trust model is unchanged: Paybox-side approvals remain the boundary.

## Security fixes

### H3 — Webhook forgery protection
- New env var `BOT_WEBHOOK_SECRET` (required in webhook mode). Passed as Telegraf's `secretToken`; Telegram sends `X-Telegram-Bot-Api-Secret-Token` and Telegraf verifies it.
- Bot **refuses to start** in webhook mode when secret is missing.
- Warns when `BOT_WEBHOOK_PATH` is default `/webhook` — recommends randomized path.
- `.env.example` and `DEPLOYMENT.md` updated. Generate with `openssl rand -hex 32`.

### H2 — Address-book poisoning protection
- `/register` may only bind a handle matching the caller's own Telegram username, unless caller is owner (`OWNER_TELEGRAM_ID`).
- Never silently overwrites: requires `--force` and shows old → new address.
- `__proto__`/`constructor`/`prototype` rejected as handles (prototype-pollution guard).

### H1 — Open-deployment exposure lock
- When `OWNER_TELEGRAM_ID` is unset, loud startup warning.
- Money + sensitive commands (`transfer`, `swap`, `pay`, `use_service`, `sign`, `secret`, `split settle`, `schedule`) are **blocked** unless `PAYBOX_OPEN_MODE=1` is explicitly set.
- Read-only commands (`balance`, `markets`, `help`…) stay open. AI-mode money intents also gated.

### M2 — AI-mode gates expanded
- `secret` and `sign` added to confirm-before-send set (`SENSITIVE_INTENTS`), so NL-triggered secret reveals and message signings require one-tap ✅ card.

### M3 — Splits authorization by immutable user id
- Payer actions (`markPaid`, `cancel`) and settle-payee identity authorized by Telegram user id (`createdBy`/`payer.userId`), not mutable username.
- Payer address captured at creation for secure settlement.

### Low-severity batch
- **L1**: forbidden handles rejected.
- **L2**: `escapeMd()` on user-controlled text (split descriptions, `/pay` merchant names, service names).
- **L4**: `/schedule cancel|pause|resume` checks `job.userId === ctx.from.id` (or owner).
- **L6**: tx id persisted to pending store **before** broadcast, preventing re-broadcast on crash-resume.

## Upgrade notes

- **Webhook mode now requires `BOT_WEBHOOK_SECRET`** — set a long random value or switch to long polling.
- If you intentionally run an open bot, set `PAYBOX_OPEN_MODE=1` or lock with `OWNER_TELEGRAM_ID`.
- Drop-in otherwise — no data migration, existing stores untouched.

## Tests

- 94 tests (79 original + 15 new security tests).
- `npm run check` clean.

**Full changelog**: see [CHANGELOG.md](CHANGELOG.md) and [compare v2.1.0...v2.1.1](https://github.com/nialthony/paybox-telegram-bot/compare/v2.1.0...v2.1.1)

**Security model**: unchanged — bot never sees private keys, card PANs or raw secrets. Signing in MoonX MPC; passkey approvals still required; these fixes are about who can ask and where answers go.
