import { Telegraf } from 'telegraf';
import { PayboxClient } from '@paybox-sh/sdk';
import dotenv from 'dotenv';
import { setupCommands } from './commands/index.js';
import { setupMiddleware } from './middleware/index.js';
import { PayboxAgent } from './agent/index.js';
import { loadConfig } from './config.js';
import { PaymentIntentStore } from './services/payment-intents.js';
import { PostgresPaymentIntentStore } from './services/postgres-payment-intents.js';
import { startReconciliationLoop } from './services/reconciliation.js';
import { createWalletTransferGateway } from './services/wallet-transfer-gateway.js';
import { reportError } from './lib/errors.js';

dotenv.config();

const config = loadConfig();
const bot = new Telegraf(config.telegramBotToken);
const paybox = PayboxClient.fromConfig({
  apiKey: config.payboxApiKey,
  signingKey: config.payboxSigningKey,
});

bot.context.paybox = paybox;
bot.context.agent = new PayboxAgent(config.openAiApiKey, { model: config.openAiModel });
const paymentIntents = config.databaseUrl
  ? PostgresPaymentIntentStore.fromConnectionString({ connectionString: config.databaseUrl })
  : new PaymentIntentStore();

if (typeof paymentIntents.initialize === 'function') {
  await paymentIntents.initialize();
}

bot.context.paymentIntents = paymentIntents;
bot.context.transferGateway = createWalletTransferGateway({
  paybox,
  enabled: config.walletTransfersEnabled,
});

setupMiddleware(bot);
setupCommands(bot);

const reconciliationLoop = startReconciliationLoop({
  store: paymentIntents,
  gateway: bot.context.transferGateway,
  intervalMs: config.reconciliationIntervalMs,
});

bot.catch(async (error, ctx) => {
  const referenceId = reportError({
    scope: 'bot_update',
    error,
    context: { telegramUserId: ctx.from?.id, chatId: ctx.chat?.id, updateType: ctx.updateType },
  });
  await ctx.reply(`❌ We could not process that update. Reference: \`${referenceId}\``, { parse_mode: 'Markdown' }).catch(() => {});
});

bot.launch({ allowedUpdates: ['message', 'callback_query'] });

console.log('Paybox Telegram Bot started.');
console.log(`Wallet transfer requests: ${config.walletTransfersEnabled ? 'enabled' : 'disabled'}`);

const shutdown = async (signal) => {
  reconciliationLoop.stop();
  bot.stop(signal);
  if (typeof paymentIntents.close === 'function') await paymentIntents.close();
};

process.once('SIGINT', () => { void shutdown('SIGINT'); });
process.once('SIGTERM', () => { void shutdown('SIGTERM'); });
