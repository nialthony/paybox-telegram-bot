# 🚀 Deployment Guide

The bot runs anywhere Node 18+ runs: a VPS, Fly.io, Railway, Render, a Pi, or Docker. Pick one launch mode.

## Launch modes

### 1. Long polling (default, zero config)

The bot calls Telegram's `getUpdates` endpoint. Works behind NAT/firewalls, no TLS, no public IP.

```bash
npm start
```

`dropPendingUpdates` is enabled, so restarts don't replay a flood of stale updates.

### 2. Webhook mode (recommended for scale)

Telegram pushes updates to your HTTPS endpoint.

```env
BOT_WEBHOOK_URL=https://bot.example.com
BOT_WEBHOOK_PATH=/webhook
BOT_PORT=3000
```

The bot serves `/webhook` plus a `/healthz` endpoint that reports `{ ok, paybox, signing, agent, pollers, uptime }`. On startup it calls `setWebhook` automatically after the server is listening.

> Telegram requires a **valid TLS certificate** for webhook URLs. Front the bot with Caddy (automatic HTTPS) or nginx.

#### Caddy example

```
bot.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

#### nginx example

```nginx
server {
    listen 443 ssl;
    server_name bot.example.com;
    ssl_certificate     /etc/letsencrypt/live/bot.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/bot.example.com/privkey.pem;

    location /webhook {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
    }
    location /healthz {
        proxy_pass http://127.0.0.1:3000;
    }
}
```

## Docker

```bash
cp .env.example .env   # edit first
docker compose up -d --build
```

- Runs as a non-root `paybox` user.
- `data/` (address book + stats) is a named volume — persists across restarts.
- HEALTHCHECK hits `/healthz` (set `BOT_WEBHOOK_URL` + expose port 3000 when using webhook mode).
- Long polling works out of the box with no port exposure.

## systemd (bare metal)

```ini
# /etc/systemd/system/paybox-bot.service
[Unit]
Description=Paybox Telegram Bot
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=paybox
WorkingDirectory=/opt/paybox-telegram-bot
EnvironmentFile=/opt/paybox-telegram-bot/.env
ExecStart=/usr/bin/node src/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now paybox-bot
journalctl -u paybox-bot -f
```

## Operational notes

- **Secrets**: `.env` is gitignored. `PAYBOX_SIGNING_KEY` and `OPENAI_API_KEY` never appear in logs (redaction is built in). Never pass the signing key as a CLI argument.
- **Data**: `DATA_DIR` holds `registry.json` (address book) and `stats.json`. Back up or mount it. Writes are atomic (temp file + rename).
- **Approvals**: passkey approvals time out after `REQUEST_TIMEOUT_MS` (default 5 min). Long-running swaps keep being watched in the background for 15 minutes.
- **Owner lock**: set `OWNER_TELEGRAM_ID` (numeric user id) to make this a single-user bot. Get your id from `@userinfobot`.
- **Rate limiting**: per-user token bucket (12 msgs / 10 s burst, refill 1.2/s) protects against accidental spam.
- **Health**: `GET /healthz` → `200 {"ok":true,...}` in webhook mode; Docker HEALTHCHECK uses it.
- **Shutdown**: SIGINT/SIGTERM stop polling gracefully, cancel active request-pollers and flush stats. Deploys that kill with SIGKILL may lose the last few stats ticks — that's all.

## Upgrading Paybox access

If the bot starts failing with `denied` reasons or missing-credential errors, use `/manage` (or `/account` → "Manage access") — the bot asks Paybox for a scoped `manage_url` that opens your passkey-gated access page. Nothing can be changed on your behalf.
