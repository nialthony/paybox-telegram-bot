import { logger } from '../logger.js';
import { explainFailure } from '../paybox/client.js';
import { escapeMd } from '../utils/format.js';

/**
 * Middleware pipeline: request logging, session attachment, authorization,
 * rate limiting and a final error guard.
 */

export class UnauthorizedError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UsageError';
  }
}

class TokenBucket {
  constructor({ capacity, refillPerSecond }) {
    this.capacity = capacity;
    this.refillPerSecond = refillPerSecond;
    this.buckets = new Map();
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [key, bucket] of this.buckets) {
        if (now - bucket.lastSeen > 10 * 60 * 1000) this.buckets.delete(key);
      }
    }, 10 * 60 * 1000);
    if (this.cleanupTimer.unref) this.cleanupTimer.unref();
  }

  take(key) {
    const now = Date.now();
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { tokens: this.capacity, lastRefill: now, lastSeen: now };
      this.buckets.set(key, bucket);
    }
    bucket.lastSeen = now;
    bucket.tokens = Math.min(
      this.capacity,
      bucket.tokens + ((now - bucket.lastRefill) / 1000) * this.refillPerSecond
    );
    bucket.lastRefill = now;
    if (bucket.tokens < 1) return false;
    bucket.tokens -= 1;
    return true;
  }

  stop() {
    clearInterval(this.cleanupTimer);
  }
}

export function setupMiddleware({ bot, config, sessions, stats }) {
  const limiter = new TokenBucket({ capacity: 12, refillPerSecond: 1.2 });

  // 1. Logging
  bot.use(async (ctx, next) => {
    const start = Date.now();
    try {
      await next();
    } finally {
      const user = ctx.from ? `@${ctx.from.username || ctx.from.id}` : 'system';
      const what = ctx.message?.text || ctx.callbackQuery?.data || ctx.updateType || 'update';
      logger.debug(`${user} → ${what} (${Date.now() - start}ms)`);
    }
  });

  // 2. Sessions
  bot.use(async (ctx, next) => {
    if (ctx.from?.id) {
      ctx.session = sessions.obtain(ctx.from.id, { agentHistory: [], ui: {} });
    } else {
      ctx.session = {};
    }
    await next();
  });

  // 3. Authorization + DM/group policy
  bot.use(async (ctx, next) => {
    const chatType = ctx.chat?.type;
    const isCallback = Boolean(ctx.callbackQuery);
    const isCommand = Boolean(ctx.message?.text?.startsWith('/')) || isCallback;

    if (config.dmOnly && chatType !== 'private' && isCommand) {
      await ctx.reply('🔒 This bot only works in private chats. Open a DM with me to continue.');
      return;
    }

    if (config.ownerTelegramId && ctx.from?.id !== config.ownerTelegramId) {
      if (isCommand) {
        await ctx.reply('🔒 Sorry, this is a private bot. It is locked to a single owner.');
      }
      return;
    }

    await next();
  });

  // 4. Rate limiting (text messages only; callbacks are user-paced already)
  bot.use(async (ctx, next) => {
    if (!ctx.message?.text) return next();
    const key = ctx.from?.id ?? 'anon';
    if (!limiter.take(key)) {
      await ctx.reply('🐌 Easy there! You are sending messages too fast. Wait a few seconds.').catch(() => {});
      return;
    }
    await next();
  });

  // 5. Stats (text commands only)
  bot.use(async (ctx, next) => {
    const match = ctx.message?.text?.match(/^\/([a-z_]+)(?:@\w+)?(?:\s|$)/);
    if (match) stats.hit(match[1]);
    await next();
  });

  // 6. Final error guard
  bot.use(async (ctx, next) => {
    try {
      await next();
    } catch (error) {
      logger.error(`unhandled error in ${ctx.updateType}:`, error);

      if (error instanceof UnauthorizedError) {
        await ctx.reply(error.message).catch(() => {});
        return;
      }
      if (error instanceof UsageError) {
        await ctx.reply(error.message, { parse_mode: 'Markdown' }).catch(() => {});
        return;
      }

      const friendly = explainFailure(error);
      const detail = escapeMd(error?.message || 'unknown error').slice(0, 200);
      const text = friendly
        ? `${friendly}\n\n_Detail: ${detail}_`
        : `❌ Something went wrong.\n\n_Detail: ${detail}_`;

      try {
        if (ctx.callbackQuery) {
          await ctx.answerCbQuery('Something went wrong').catch(() => {});
        }
        await ctx.reply(text, { parse_mode: 'Markdown' }).catch(() => {});
      } catch {
        /* Telegram may block edits/replies; nothing more to do. */
      }
    }
  });

  return {
    stop: () => limiter.stop(),
  };
}
