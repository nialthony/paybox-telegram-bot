# 🤖 Paybox Telegram Bot

A production-grade Telegram bot powered by **Paybox** — the non-custodial wallet for AI agents. Check portfolios, transfer crypto, swap & bridge, pay for x402 services, browse prediction markets, sign messages and reveal scoped secrets — all from Telegram, with every money operation passkey-approved or bounded by your Paybox grant.

Built on `@paybox-sh/sdk` v0.8 and the official Paybox REST surface (no MCP host required), with in-process MoonX envelope signing via the `pbxk1.` signing key.

---

## ✨ Features

### Wallet & money movement
| Command | What it does |
| --- | --- |
| `/balance` | Portfolio across all granted wallets (holdings, USD totals, 24h change) |
| `/transfer <@user\|address> <amount> <token>` | On-chain transfer — ETH (Ethereum), ETH on Base, SOL (Solana). Resolves `@users` from the address book |
| `/swap <from> <to> <amount>` | Token swaps **and cross-chain bridges** (USDC ⇄ ETH ⇄ SOL, any pair) via MoonX routing |
| `/buy [usd] [chain]` | Signed MoonPay checkout link to fund a wallet with fiat — moves no money by itself |
| `/pay <merchant> <url> <usd>` | Merchant-scoped **one-time virtual card** for a card credential |
| `/sign <message>` | EIP-191 / EIP-712 / Solana message signatures (private key never leaves MoonX MPC) |
| `/secret <name> [--raw]` | Reveal a scoped secret credential (one-time token, or raw with a raw grant) |

### Services & markets
| Command | What it does |
| --- | --- |
| `/services [query]` | Browse curated paid **x402** services, tap a number to pay & fetch |
| `/use_service <url> [method] [json]` | Paybox gateway mode: pay for an x402 resource and get its response |
| `/markets` · `/market <ticker>` · `/orderbook <id>` | Prediction markets (World plugin) — events, nested markets, books |
| `/price <ticker>` | 7-day price chart rendered as a sparkline |
| `/positions` | Your market positions |
| `/perp [coin]` | Hyperliquid market data |

### Reliability & automation (new in v2.1)
| Command | What it does |
| --- | --- |
| `/split <amount> <token> <what> @a @b` | Group expense splitter — even shares, balances, settle via a real `/transfer` |
| `/split settle <id>` · `/split paid <id> @user` | Pay your share to the payer (approvals apply) · mark out-of-band settlements |
| `/schedule add every 6h /price ETH` | Run a command on an interval — **approvals still apply on every run** |
| `/schedule add daily 09:00 /balance` | Run a command daily at a set time (`SCHEDULER_TZ`, default UTC) |
| `/schedule list · pause · resume · cancel` | Manage scheduled jobs |

### Account & safety
| Command | What it does |
| --- | --- |
| `/account` | Granted credentials, approval modes, ungranted warnings |
| `/manage` | Paybox access page to grant/limit credentials (request_account_change) |
| `/history` | This bot client's request log — payments, signatures, swaps |
| `/register` · `/whois` · `/unregister` | On-disk address book mapping Telegram handles → addresses |
| `/stats` | Bot usage counters |

### Intelligence
Set `OPENAI_API_KEY` and the bot understands natural language in DMs: *"send 5 USDC to @alice"*, *"how much ETH do I have?"*, *"any markets on the Fed decision?"*. The model maps your sentence to the **same command functions** as slash commands — nothing it decides bypasses validation or approval flows — and every money move is gated by a **one-tap ✅ Confirm / ✏️ Change / ❌ Cancel card** before anything runs. Conversation memory is kept per user (in-memory, last 6 turns).

### Engineering
- **Approval flows done right**: `pending_approval` → approval link → poll → finish in-process signing → broadcast → confirm on-chain, with live message edits the whole way
- **Crash-safe resume**: in-flight requests are persisted and resumed after a restart, on the same message — a reboot no longer orphans a payment
- **On-chain confirmation watcher**: broadcast → included (n/12 confirmations) → final, with explorer links; reverted/failed transactions reported as such
- **Command scheduler**: durable recurring jobs whose every run passes the normal dispatcher and passkey approvals
- **Headless signing protocol** re-implemented on top of the SDK (`/binding` → `/moonx-sign` → `/signature`) so passkey-approved requests complete without an iframe
- Owner lock (`OWNER_TELEGRAM_ID`), DM-only mode, per-user rate limiting
- Secret redaction in all logs, crash-safe JSON stores (atomic writes)
- Long-polling **or** webhook mode with `/healthz` (reports pending requests, scheduled jobs, active watchers)
- Graceful shutdown (scheduler, pollers, watchers), Docker image with healthcheck
- 79 unit tests (`npm test`), zero native dependencies

---

## 🔐 Security model

1. **Non-custodial.** The bot never sees a private key, key share, card PAN, or raw secret. Signing happens in MoonX MPC; the bot receives scoped outputs only (a signature, a one-time card, a short-lived token).
2. **Passkey approvals.** Credentials with `always_approve` pause every operation for your passkey in the Paybox app; `autonomous` credentials act inside the limits you granted.
3. **The signing key (`pbxk1.`).** Used locally (Ed25519) to authenticate signing envelopes to MoonX. It never leaves the machine except to MoonX; Paybox never sees it.
4. **One-time outputs.** Virtual cards are merchant-scoped and single-use; payment tokens are claimed exactly once; secret tokens are one-time.
5. **Auditability.** Every request is in your Paybox audit log and in `/history`.

> 🛑 Never commit `.env`. Set strict grant limits in the Paybox app for this bot. Review the audit log regularly.

---

## 🚀 Quick start

Prereqs: **Node 18+**, a Telegram bot token ([@BotFather](https://t.me/botfather)), and a Paybox account ([app.paybox.sh](https://app.paybox.sh)) with a wallet and/or card granted to this bot.

```bash
git clone https://github.com/nialthony/paybox-telegram-bot.git
cd paybox-telegram-bot
npm install
cp .env.example .env    # then edit it
```

`.env` essentials:

```env
TELEGRAM_BOT_TOKEN=123456:ABC-...
PAYBOX_API_KEY=pbx_live_...
PAYBOX_SIGNING_KEY=pbxk1....        # needed for transfers/swaps/signing/x402
OPENAI_API_KEY=sk-...               # optional, enables AI mode
```

Run it:

```bash
npm start        # long polling (zero extra config)
# or
npm run dev      # auto-restart on file changes
```

On first start the bot registers its command menu with Telegram. Open a DM, press `/start` and follow the inline buttons.

### Granting access in Paybox
1. In the Paybox app, go to **Clients** (or the agent section) and find this bot's client.
2. Grant a **wallet** (and a **card**, if you want `/pay`).
3. Generate a **Signing Key** (`pbxk1.`) scoped to the wallets you granted and paste it into `PAYBOX_SIGNING_KEY`.
4. For markets: enable the **World** and/or **Hyperliquid** plugins at [app.paybox.sh/plugins](https://app.paybox.sh/plugins).

### Docker

```bash
cp .env.example .env       # edit
docker compose up -d --build
```

The container runs long polling by default. For webhook mode set `BOT_WEBHOOK_URL`, expose port 3000, and front it with TLS (Caddy/nginx/Traefik).

---

## 📱 Examples

See [EXAMPLES.md](./EXAMPLES.md) for full conversation walkthroughs. Deployment details (webhooks, systemd, TLS) live in [DEPLOYMENT.md](./DEPLOYMENT.md). Bigger ideas in [IDEAS.md](./IDEAS.md).

## 🧪 Development

```bash
npm test                # unit tests (node:test, no extra deps)
npm run check           # syntax check the entrypoint
```

Code layout:

```
src/
  index.js            # entrypoint: launch mode, healthz, graceful shutdown
  config.js           # validated env config (the only place that reads process.env)
  logger.js           # leveled logger with secret redaction
  bot.js              # bot assembly: context, middleware, commands, actions
  agent/              # OpenAI natural-language mode → intent dispatcher
  paybox/
    client.js         # SDK wrapper: credential normalization, error mapping
    signing.js        # headless MoonX envelope signing + transfer tx builders
  commands/           # one module per command family
  actions/            # inline-keyboard callback router
  middleware/         # logging, sessions, authz, rate limiting, error guard
  store/              # sessions (memory), registry + stats (crash-safe JSON)
  utils/              # tokens/chains, validation, formatting, polling, charts
```

---

**Made with ❤️ to showcase the power of Paybox + Telegram**

🔗 [Paybox](https://paybox.sh) · [Docs](https://docs.paybox.sh) · [Telegraf](https://telegraf.js.org) · [Telegram](https://telegram.org)
