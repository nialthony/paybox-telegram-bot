import { formatTimestamp } from '../utils/format.js';

/** /stats — bot usage counters since process start (persisted to disk). */
export async function statsCommand(ctx) {
  if (!ctx.stats) {
    await ctx.reply('📊 Stats are not available in this configuration.', { parse_mode: 'Markdown' });
    return;
  }

  const snapshot = ctx.stats.snapshot();
  const rows = Object.entries(snapshot.commands)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([command, count]) => `• /${command}: ${count}`);

  await ctx.reply(
    '📊 **Bot stats**\n\n' +
      `Commands served: ${snapshot.total}\n` +
      `Since: ${formatTimestamp(snapshot.startedAt)}\n\n` +
      (rows.length ? `*Top commands*\n${rows.join('\n')}` : '_No commands yet._') +
      `\n\nSessions: ${ctx.sessions?.size() ?? '?'} · Active pollers: ${ctx.pollerCount?.() ?? '?'}`,
    { parse_mode: 'Markdown' }
  );
}
