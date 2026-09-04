import { logger } from '../logger.js';

/**
 * Inline-keyboard callback router.
 * Navigation callbacks re-run the same command functions as slash commands,
 * so behaviour stays identical. Unknown callbacks are answered quietly.
 */
export function setupActions({ bot, dispatcher }) {
  bot.action(/^nav:(.+)$/, async (ctx) => {
    const target = ctx.match[1];
    const command = dispatcher[target] || dispatcher[`${target}Command`];
    await ctx.answerCbQuery().catch(() => {});
    if (command) {
      await command(ctx, []);
    }
  });

  bot.action('manage', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    if (dispatcher.manage) await dispatcher.manage(ctx, []);
  });

  // "Use this x402 service" — service list stored by /services.
  bot.action(/^svc:use:(\d+)$/, async (ctx) => {
    const index = Number(ctx.match[1]);
    const service = ctx.session?.ui?.serviceList?.[index];
    await ctx.answerCbQuery().catch(() => {});
    if (!service || !dispatcher.useService) {
      await ctx.reply('📭 That service list has expired — run /services again.', { parse_mode: 'Markdown' }).catch(() => {});
      return;
    }
    const url = service.resource || service.url;
    if (!url) {
      await ctx.reply('❌ That service has no usable URL.', { parse_mode: 'Markdown' }).catch(() => {});
      return;
    }
    await dispatcher.useService(ctx, [url]);
  });

  // Market detail from the /markets list.
  bot.action(/^mkt:detail:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    if (dispatcher.market) {
      await dispatcher.market(ctx, [ctx.match[1]]);
    }
  });

  bot.action(/.*/, (ctx) => {
    logger.debug(`unhandled callback: ${ctx.callbackQuery?.data}`);
    return ctx.answerCbQuery().catch(() => {});
  });
}
