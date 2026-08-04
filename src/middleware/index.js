export function setupMiddleware(bot) {
  // Logging middleware
  bot.use(async (ctx, next) => {
    const start = Date.now();
    console.log(`[${new Date().toISOString()}] ${ctx.from?.username || ctx.from?.id} - ${ctx.message?.text || ctx.update.callback_query?.data || 'unknown'}`);
    await next();
    const ms = Date.now() - start;
    console.log(`Response time: ${ms}ms`);
  });

  // Session middleware (in-memory for demo, use Redis for production)
  const sessions = new Map();
  bot.use(async (ctx, next) => {
    const userId = ctx.from?.id;
    if (!sessions.has(userId)) {
      sessions.set(userId, {
        userId,
        username: ctx.from?.username,
        state: 'idle',
        data: {},
      });
    }
    ctx.session = sessions.get(userId);
    await next();
  });

  // Error handling middleware
  bot.use(async (ctx, next) => {
    try {
      await next();
    } catch (err) {
      console.error('Middleware error:', err);
      const errorMsg = err.message || 'An error occurred';
      ctx.reply(`❌ Error: ${errorMsg}`).catch(() => {});
    }
  });
}
