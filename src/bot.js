import { Telegraf } from 'telegraf';
import { logger } from './logger.js';
import { setupMiddleware } from './middleware/index.js';
import { setupActions } from './actions/index.js';
import { handleNaturalLanguage, PayboxAgent } from './agent/index.js';
import { pollerCount } from './utils/poll.js';

import { startCommand } from './commands/start.js';
import { helpCommand } from './commands/help.js';
import { accountCommand, manageCommand } from './commands/account.js';
import { balanceCommand } from './commands/balance.js';
import { buyCommand } from './commands/buy.js';
import { transferCommand } from './commands/transfer.js';
import { swapCommand } from './commands/swap.js';
import { payCommand } from './commands/pay.js';
import { signCommand } from './commands/sign.js';
import { secretCommand } from './commands/secret.js';
import { servicesCommand, useServiceCommand } from './commands/services.js';
import {
  marketsCommand,
  marketCommand,
  orderbookCommand,
  priceCommand,
  positionsCommand,
  perpCommand,
} from './commands/markets.js';
import { historyCommand } from './commands/history.js';
import { registerCommand, whoisCommand, unregisterCommand } from './commands/register.js';
import { statsCommand } from './commands/stats.js';

const COMMAND_LIST = [
  { command: 'start', description: 'Welcome + status' },
  { command: 'help', description: 'All commands' },
  { command: 'balance', description: 'Portfolio across chains' },
  { command: 'buy', description: 'Fund a wallet with fiat (MoonPay)' },
  { command: 'transfer', description: 'Send crypto on-chain' },
  { command: 'swap', description: 'Swap or bridge tokens' },
  { command: 'pay', description: 'Pay a merchant with a one-time card' },
  { command: 'sign', description: 'Sign a message' },
  { command: 'secret', description: 'Reveal a secret credential' },
  { command: 'services', description: 'Browse paid x402 services' },
  { command: 'use_service', description: 'Pay & fetch an x402 resource' },
  { command: 'markets', description: 'Prediction markets' },
  { command: 'market', description: 'Market detail' },
  { command: 'orderbook', description: 'Order book' },
  { command: 'price', description: 'Price chart' },
  { command: 'positions', description: 'Your market positions' },
  { command: 'perp', description: 'Hyperliquid data' },
  { command: 'account', description: 'Credentials & grants' },
  { command: 'manage', description: 'Open Paybox access page' },
  { command: 'history', description: 'Recent requests' },
  { command: 'register', description: 'Save an address to the book' },
  { command: 'whois', description: 'Look up the address book' },
  { command: 'stats', description: 'Bot usage counters' },
];

/**
 * Assemble the bot: context wiring, middleware, commands, actions and the
 * natural-language fallback.
 */
export function createBot({ config, paybox, sessions, registry, stats }) {
  const bot = new Telegraf(config.telegramBotToken, {
    telegram: { webhookReply: false },
  });

  // Command functions keyed by AI-agent intent name.
  const dispatcher = {
    help: helpCommand,
    balance: balanceCommand,
    account: accountCommand,
    manage: manageCommand,
    history: historyCommand,
    transfer: transferCommand,
    swap: swapCommand,
    pay: payCommand,
    buy: buyCommand,
    sign: signCommand,
    secret: secretCommand,
    services: servicesCommand,
    useService: useServiceCommand,
    markets: marketsCommand,
    market: marketCommand,
    orderbook: orderbookCommand,
    price: priceCommand,
    positions: positionsCommand,
    perp: perpCommand,
    register: registerCommand,
    stats: statsCommand,
  };

  const agent = new PayboxAgent(config, logger);

  // Context wiring
  bot.context.config = config;
  bot.context.paybox = paybox;
  bot.context.canSign = config.canSign && Boolean(paybox);
  bot.context.hasAgent = agent.enabled;
  bot.context.sessions = sessions;
  bot.context.registry = registry;
  bot.context.stats = stats;
  bot.context.agent = agent;
  bot.context.dispatcher = dispatcher;
  bot.context.pollerCount = pollerCount;

  setupMiddleware({ bot, config, sessions, stats });

  // Slash commands
  bot.start(startCommand);
  bot.help(helpCommand);
  bot.command('balance', (ctx) => balanceCommand(ctx, []));
  bot.command('buy', (ctx) => buyCommand(ctx, parseArgs(ctx)));
  bot.command('transfer', (ctx) => transferCommand(ctx, parseArgs(ctx)));
  bot.command('swap', (ctx) => swapCommand(ctx, parseArgs(ctx)));
  bot.command('pay', (ctx) => payCommand(ctx, parseArgs(ctx)));
  bot.command('sign', (ctx) => signCommand(ctx, parseArgs(ctx)));
  bot.command('secret', (ctx) => secretCommand(ctx, parseArgs(ctx)));
  bot.command('services', (ctx) => servicesCommand(ctx, parseArgs(ctx)));
  bot.command('use_service', (ctx) => useServiceCommand(ctx, parseArgs(ctx)));
  bot.command('markets', (ctx) => marketsCommand(ctx, parseArgs(ctx)));
  bot.command('market', (ctx) => marketCommand(ctx, parseArgs(ctx)));
  bot.command('orderbook', (ctx) => orderbookCommand(ctx, parseArgs(ctx)));
  bot.command('price', (ctx) => priceCommand(ctx, parseArgs(ctx)));
  bot.command('positions', (ctx) => positionsCommand(ctx, []));
  bot.command('perp', (ctx) => perpCommand(ctx, parseArgs(ctx)));
  bot.command('account', (ctx) => accountCommand(ctx));
  bot.command('manage', (ctx) => manageCommand(ctx, parseArgs(ctx)));
  bot.command('history', (ctx) => historyCommand(ctx, parseArgs(ctx)));
  bot.command('register', (ctx) => registerCommand(ctx, parseArgs(ctx)));
  bot.command('whois', (ctx) => whoisCommand(ctx, parseArgs(ctx)));
  bot.command('unregister', (ctx) => unregisterCommand(ctx, parseArgs(ctx)));
  bot.command('stats', (ctx) => statsCommand(ctx));

  // Inline-keyboard callbacks
  setupActions({ bot, dispatcher });

  // Natural language (private chats always; groups only when mentioned)
  let botUsername = '';
  bot.use(async (ctx, next) => {
    if (!botUsername && bot.botInfo?.username) botUsername = bot.botInfo.username;
    await next();
  });
  bot.on('text', async (ctx) => {
    const text = ctx.message.text;
    if (text.startsWith('/')) return;

    const chatType = ctx.chat?.type;
    if (chatType === 'private') {
      return handleNaturalLanguage(ctx);
    }
    if (botUsername && text.includes(`@${botUsername}`)) {
      return handleNaturalLanguage(ctx);
    }
    // Group chatter — stay silent.
  });

  return bot;
}

function parseArgs(ctx) {
  const text = ctx.message?.text ?? '';
  const parts = text.replace(/^\/\w+(?:@\w+)?/, '').trim().split(/\s+/);
  return parts[0] === '' ? [] : parts;
}

export { COMMAND_LIST };
