import { Telegraf } from 'telegraf';
import { PayboxClient } from '@paybox-sh/sdk';
import dotenv from 'dotenv';
import { setupCommands } from './commands/index.js';
import { setupMiddleware } from './middleware/index.js';

dotenv.config();

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Initialize Paybox client
const paybox = PayboxClient.fromConfig({
  apiKey: process.env.PAYBOX_API_KEY,
  signingKey: process.env.PAYBOX_SIGNING_KEY,
});

// Attach paybox to bot context
bot.context.paybox = paybox;

// Setup middleware
setupMiddleware(bot);

// Setup commands
setupCommands(bot);

// Error handling
bot.catch((err, ctx) => {
  console.error('Bot error:', err);
  ctx.reply('❌ An error occurred. Please try again later.').catch(() => {});
});

// Start bot
bot.launch();

console.log('🤖 Paybox Telegram Bot started!');
console.log('📱 Bot is ready to receive messages');

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
