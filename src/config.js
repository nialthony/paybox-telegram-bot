function requireValue(value, name) {
  if (!value || !String(value).trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return String(value).trim();
}

export function loadConfig(env = process.env) {
  const walletTransfersRequested = env.ENABLE_WALLET_TRANSFERS === 'true';
  const walletTransfersKillSwitch = env.PAYBOX_WALLET_TRANSFERS_KILL_SWITCH === 'true';
  const walletTransfersEnabled = walletTransfersRequested && !walletTransfersKillSwitch;
  const databaseUrl = env.DATABASE_URL || undefined;
  const reconciliationIntervalMs = Number(env.RECONCILIATION_INTERVAL_MS || 30_000);
  const healthPort = Number(env.HEALTH_PORT || 3000);

  if (!Number.isInteger(reconciliationIntervalMs) || reconciliationIntervalMs < 5_000) {
    throw new Error('RECONCILIATION_INTERVAL_MS must be an integer of at least 5000 milliseconds.');
  }

  if (!Number.isInteger(healthPort) || healthPort < 0 || healthPort > 65_535) {
    throw new Error('HEALTH_PORT must be an integer between 0 and 65535.');
  }

  if ((env.NODE_ENV || 'development') === 'production' && !databaseUrl) {
    throw new Error('DATABASE_URL is required in production for durable payment intents.');
  }

  if (walletTransfersRequested && !walletTransfersKillSwitch && env.PAYBOX_TRANSFER_ADAPTER_CONFIRMED !== 'true') {
    throw new Error(
      'ENABLE_WALLET_TRANSFERS requires PAYBOX_TRANSFER_ADAPTER_CONFIRMED=true after a verified SDK integration review.',
    );
  }

  return Object.freeze({
    nodeEnv: env.NODE_ENV || 'development',
    telegramBotToken: requireValue(env.TELEGRAM_BOT_TOKEN, 'TELEGRAM_BOT_TOKEN'),
    payboxApiKey: requireValue(env.PAYBOX_API_KEY, 'PAYBOX_API_KEY'),
    payboxSigningKey: env.PAYBOX_SIGNING_KEY || undefined,
    openAiApiKey: env.OPENAI_API_KEY || undefined,
    openAiModel: env.OPENAI_MODEL || 'gpt-4o-mini',
    walletTransfersRequested,
    walletTransfersKillSwitch,
    walletTransfersEnabled,
    databaseUrl,
    reconciliationIntervalMs,
    healthHost: env.HEALTH_HOST || '0.0.0.0',
    healthPort,
  });
}
