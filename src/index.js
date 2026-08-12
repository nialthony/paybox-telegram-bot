import { Telegraf } from 'telegraf';
import { PayboxClient } from '@paybox-sh/sdk';
import dotenv from 'dotenv';
import { setupCommands } from './commands/index.js';
import { setupMiddleware } from './middleware/index.js';
import { PayboxAgent } from './agent/index.js';
import { loadConfig } from './config.js';
import { PaymentIntentStore } from './services/payment-intents.js';
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
bot.context.paymentIntents = new PaymentIntentStore();
bot.context.transferGateway = createWalletTransferGateway({
  paybox,
  enabled: config.walletTransfersEnabled,
});

setupMiddleware(bot);
setupCommands(bot);

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

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
