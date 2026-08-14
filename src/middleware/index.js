import { reportError, replyWithSafeError } from '../lib/errors.js';

export function createRateLimiter({ windowMs = 60_000, maxRequests = 20, now = () => Date.now() } = {}) {
  const requests = new Map();

  return function isAllowed(userId) {
    if (!userId) return true;
    const cutoff = now() - windowMs;
    const recent = (requests.get(String(userId)) || []).filter((timestamp) => timestamp > cutoff);

    if (recent.length >= maxRequests) {
      requests.set(String(userId), recent);
      return false;
    }

    recent.push(now());
    requests.set(String(userId), recent);
    return true;
  };
}

export function setupMiddleware(bot) {
  const isAllowed = createRateLimiter();

  bot.use(async (ctx, next) => {
    try {
      await next();
    } catch (error) {
      const referenceId = reportError({
        scope: 'middleware',
        error,
        context: { telegramUserId: ctx.from?.id, chatId: ctx.chat?.id, updateType: ctx.updateType },
      });
      await replyWithSafeError(ctx, { referenceId, message: 'We could not process that request.' }).catch(() => {});
    }
  });

  bot.use(async (ctx, next) => {
    if (!isAllowed(ctx.from?.id)) {
      await ctx.reply('⚠️ Too many requests. Please wait a minute and try again.');
      return;
    }
    await next();
  });

  bot.use(async (ctx, next) => {
    const start = Date.now();
    await next();
    console.log({
      event: 'telegram_update_processed',
      telegramUserId: ctx.from?.id,
      chatId: ctx.chat?.id,
      updateType: ctx.updateType,
      durationMs: Date.now() - start,
    });
  });
}
