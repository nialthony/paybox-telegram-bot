import { requireClient } from './shared.js';
import { listRequests, statusLabel } from '../paybox/client.js';
import { formatTimestamp } from '../utils/format.js';
import { logger } from '../logger.js';

const KIND_ICON = {
  payment: '💳',
  wallet_sign: '✍️',
  secret: '🔑',
  swap: '🔁',
  x402: '🛍',
  service: '🛍',
};

/**
 * /history [limit] — recent Paybox requests created by this bot client,
 * newest first. Uses the REST `list_requests` endpoint via the SDK's
 * authenticated request channel.
 */
export async function historyCommand(ctx, args) {
  const limit = Math.min(Number.parseInt(args[0], 10) || 12, 50);
  const progress = await ctx.reply('📒 Loading request history…');

  try {
    const client = requireClient(ctx);
    const raw = await listRequests(client, { limit });
    const rows = Array.isArray(raw) ? raw : raw?.requests ?? [];

    if (rows.length === 0) {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        progress.message_id,
        undefined,
        '📒 **No requests yet**\n\nEvery payment, signature and swap this bot makes lands here.',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    const lines = ['📒 **Recent requests**', ''];
    for (const row of rows) {
      const icon = KIND_ICON[row.kind] ?? '•';
      const id = String(row.request_id ?? '').slice(0, 10);
      const label = statusLabel(row.status);
      lines.push(
        `${icon} \`${id}…\` _${row.kind ?? 'request'}_ — ${label} (${formatTimestamp(row.created_at)})`
      );
    }

    await ctx.telegram.editMessageText(ctx.chat.id, progress.message_id, undefined, lines.join('\n'), {
      parse_mode: 'Markdown',
      link_preview_options: { is_disabled: true },
    });
  } catch (error) {
    logger.error('history error:', error.message);
    await ctx.telegram.editMessageText(
      ctx.chat.id,
      progress.message_id,
      undefined,
      `❌ Could not load history: ${error.message}`,
      { parse_mode: 'Markdown' }
    );
  }
}
