function requireValue(value, name) {
  if (!value || !String(value).trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return String(value).trim();
}

export function loadConfig(env = process.env) {
  const walletTransfersEnabled = env.ENABLE_WALLET_TRANSFERS === 'true';

  if (walletTransfersEnabled && env.PAYBOX_TRANSFER_ADAPTER_CONFIRMED !== 'true') {
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
    walletTransfersEnabled,
  });
}
