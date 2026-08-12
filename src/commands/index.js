import { startCommand } from './start.js';
import { balanceCommand } from './balance.js';
import { transferCommand } from './transfer.js';
import { payCommand, cancelPaymentCallback, confirmPaymentCallback } from './pay.js';
import { signCommand } from './sign.js';
import { servicesCommand } from './services.js';
import { helpCommand } from './help.js';
import { reportError, replyWithSafeError } from '../lib/errors.js';

export function setupCommands(bot) {
  bot.start(startCommand);
  bot.help(helpCommand);
  bot.command('balance', balanceCommand);
  bot.command('transfer', transferCommand);
  bot.command('pay', payCommand);
  bot.command('sign', signCommand);
  bot.command('services', servicesCommand);

  bot.action(/^payment:(confirm|cancel):([a-f0-9-]{36})$/, async (ctx) => {
    const [, action, intentId] = ctx.match;
    if (action === 'confirm') {
      return confirmPaymentCallback(ctx, intentId);
    }
    return cancelPaymentCallback(ctx, intentId);
  });

  bot.on('text', async (ctx) => {
    const text = ctx.message.text;
    if (text.startsWith('/')) return;

    if (!ctx.agent.enabled) {
      return ctx.reply('👋 Natural-language assistance is disabled. Use /help to see available commands.');
    }

    try {
      const aiResult = await ctx.agent.processMessage(text);
      if (aiResult.intent === 'balance') {
        await ctx.reply(aiResult.reply);
        return balanceCommand(ctx);
      }

      if (aiResult.intent === 'payment_draft') {
        return ctx.reply(
          `${aiResult.reply}\n\nFor your security, I will not initiate a payment from natural language. Verify the destination and submit a direct command: \`/pay <wallet_address> <amount> <ETH|SOL>\`.`,
          { parse_mode: 'Markdown' },
        );
      }

      if (aiResult.intent === 'services') {
        const query = aiResult.params.query ? ` ${aiResult.params.query}` : '';
        return ctx.reply(`${aiResult.reply}\n\nUse \`/services${query}\` to browse services.`, { parse_mode: 'Markdown' });
      }

      return ctx.reply(aiResult.reply);
    } catch (error) {
      const referenceId = reportError({
        scope: 'ai_router',
        error,
        context: { telegramUserId: ctx.from?.id, chatId: ctx.chat?.id },
      });
      return replyWithSafeError(ctx, { referenceId, message: 'I could not process that request.' });
    }
  });
}
