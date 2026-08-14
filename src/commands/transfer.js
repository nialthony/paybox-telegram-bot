import { payCommand } from './pay.js';

/**
 * Legacy command alias. It intentionally shares the same validated draft and
 * explicit confirmation flow as /pay so transaction logic cannot drift.
 */
export async function transferCommand(ctx) {
  const commandText = (ctx.message?.text || '').replace(/^\/transfer\b/i, '/pay');
  return payCommand(ctx, commandText);
}
