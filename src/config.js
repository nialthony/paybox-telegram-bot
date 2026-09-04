import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';

/**
 * Central, validated configuration. Everything the bot needs comes from here,
 * so the rest of the code never reads `process.env` directly.
 */

const bool = (value, fallback = false) => {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

const int = (value, fallback) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
};

function buildConfig(env = process.env) {
  const dataDir = path.resolve(env.DATA_DIR || 'data');

  const config = {
    env: env.NODE_ENV || 'development',
    isProd: env.NODE_ENV === 'production',

    // Telegram
    telegramBotToken: env.TELEGRAM_BOT_TOKEN || '',
    botWebhookUrl: env.BOT_WEBHOOK_URL || '',
    botPort: int(env.BOT_PORT, 3000),
    botWebhookPath: env.BOT_WEBHOOK_PATH || '/webhook',
    /** If set, only this Telegram user can run financial commands. */
    ownerTelegramId: env.OWNER_TELEGRAM_ID ? int(env.OWNER_TELEGRAM_ID, 0) : null,
    /** If set, the bot refuses to run in group chats at all. */
    dmOnly: bool(env.BOT_DM_ONLY, false),

    // Paybox
    payboxApiKey: env.PAYBOX_API_KEY || '',
    payboxApiUrl: env.PAYBOX_API_URL || 'https://api.paybox.sh',
    payboxSigningKey: env.PAYBOX_SIGNING_KEY || '',

    // AI agent (optional)
    openaiApiKey: env.OPENAI_API_KEY || '',
    openaiModel: env.OPENAI_MODEL || 'gpt-4o-mini',
    openaiBaseUrl: env.OPENAI_BASE_URL || '',

    // Network RPCs (public defaults; override for reliability)
    rpc: {
      ethereum: env.RPC_ETHEREUM || 'https://ethereum-rpc.publicnode.com',
      base: env.RPC_BASE || 'https://mainnet.base.org',
      solana: env.RPC_SOLANA || 'https://api.mainnet-beta.solana.com',
    },

    // Behaviour
    requestTimeoutMs: int(env.REQUEST_TIMEOUT_MS, 5 * 60 * 1000), // approval wait ceiling
    pollIntervalMs: int(env.POLL_INTERVAL_MS, 4000),
    dataDir,
    logLevel: env.LOG_LEVEL || 'info',

    // Runtime capabilities
    hasPaybox: Boolean(env.PAYBOX_API_KEY),
    canSign: Boolean(env.PAYBOX_SIGNING_KEY),
    hasAgent: Boolean(env.OPENAI_API_KEY),
  };

  return config;
}

const config = buildConfig();

/** Ensure the data directory exists (registry, stats, ...). */
export function ensureDataDir(cfg = config) {
  fs.mkdirSync(cfg.dataDir, { recursive: true });
}

/** Startup validation with actionable messages. */
export function validateConfig(cfg = config) {
  const problems = [];

  if (!cfg.telegramBotToken) {
    problems.push('TELEGRAM_BOT_TOKEN is missing — get one from @BotFather.');
  }
  if (!cfg.payboxApiKey) {
    problems.push(
      'PAYBOX_API_KEY is missing — the bot will start in "setup" mode. ' +
        'Get an Auth Token from the Paybox app (https://app.paybox.sh).'
    );
  }
  if (cfg.ownerTelegramId && !Number.isInteger(cfg.ownerTelegramId)) {
    problems.push('OWNER_TELEGRAM_ID must be a numeric Telegram user id.');
  }
  if (cfg.botWebhookUrl && !/^https:\/\//.test(cfg.botWebhookUrl)) {
    problems.push('BOT_WEBHOOK_URL must be an https:// URL (Telegram requires TLS).');
  }
  if (cfg.payboxApiKey && !cfg.payboxSigningKey) {
    problems.push(
      'PAYBOX_SIGNING_KEY is not set — transfers, swaps, signing and x402 ' +
        'payments will be unavailable (read-only mode).'
    );
  }

  return problems;
}

export default config;
