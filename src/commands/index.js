import { startCommand } from './start.js';
import { balanceCommand } from './balance.js';
import { transferCommand } from './transfer.js';
import { payCommand } from './pay.js';
import { signCommand } from './sign.js';
import { servicesCommand } from './services.js';
import { helpCommand } from './help.js';

export function setupCommands(bot) {
  // Start command
  bot.start(startCommand);

  // Help command
  bot.help(helpCommand);

  // Balance command
  bot.command('balance', balanceCommand);

  // Transfer command
  bot.command('transfer', transferCommand);

  // Pay command
  bot.command('pay', payCommand);

  // Sign command
  bot.command('sign', signCommand);

  // Services command (x402 services)
  bot.command('services', servicesCommand);

  // Handle text messages
  bot.on('text', async (ctx) => {
    if (ctx.message.text.startsWith('/')) {
      return; // Already handled by command handlers
    }
    
    // Echo for now, can be extended with AI
    ctx.reply('👋 I\'m a Paybox bot! Use /help to see available commands.');
  });
}
