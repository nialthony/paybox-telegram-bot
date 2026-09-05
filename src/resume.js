import { CHAINS } from './utils/tokens.js';
import { driveTransferToCompletion } from './commands/transfer.js';
import { logger } from './logger.js';

/**
 * Crash-safe resume.
 *
 * On startup, every request still recorded in the pending store is picked
 * back up: the status message the user already has on screen is re-used, the
 * Paybox request is re-checked, and the flow continues exactly where it
 * stopped — waiting for the passkey approval, finishing the in-process
 * signature, broadcasting, and watching the on-chain confirmation.
 *
 * Records older than PENDING_MAX_AGE_MS are pruned with a final message.
 * (`drive` is an injection seam for tests.)
 */

export const PENDING_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export async function resumePendingRequests({ config, paybox, telegram, pending, stats, drive = driveTransferToCompletion }) {
  if (!pending) return { resumed: 0, pruned: 0, failed: 0 };

  const pruned = pending.prune(PENDING_MAX_AGE_MS);
  for (const record of pruned) {
    telegram
      .editMessageText(
        record.chatId,
        record.messageId,
        undefined,
        '⌛ This request was still unresolved after 24h — I stopped tracking it. Check /history or the Paybox app.'
      )
      .catch(() => {});
  }

  const records = pending.list();
  if (records.length === 0) {
    return { resumed: 0, pruned: pruned.length, failed: 0 };
  }

  logger.info(`resume: picking up ${records.length} in-flight request(s)`);
  let resumed = 0;
  let failed = 0;

  for (const record of records) {
    try {
      if (record.kind !== 'transfer') {
        pending.untrack(record.requestId);
        continue;
      }

      telegram
        .editMessageText(
          record.chatId,
          record.messageId,
          undefined,
          '🔄 **Bot restarted** — picking this transfer back up where it left off…',
          { parse_mode: 'Markdown' }
        )
        .catch(() => {});

      const request = await paybox.getRequest(record.requestId);
      const chain = CHAINS[record.chainKey];
      if (!chain) {
        throw new Error(`unknown chain ${record.chainKey}`);
      }

      const result = await drive({
        config,
        paybox,
        telegram,
        chatId: record.chatId,
        messageId: record.messageId,
        request,
        intent: record.intent,
        chain,
        recipient: record.recipient,
        amount: record.amount,
        pending,
        stats,
      });
      resumed += 1;
      logger.info(`resume: ${record.requestId} → ${result.ok ? 'ok' : result.status ?? 'failed'}`);
    } catch (error) {
      failed += 1;
      logger.error(`resume: failed to resume ${record.requestId}: ${error.message}`);
      telegram
        .editMessageText(
          record.chatId,
          record.messageId,
          undefined,
          `❌ Could not resume this request after restart — ${error.message}. Check /history.`,
          { parse_mode: 'Markdown' }
        )
        .catch(() => {});
      pending.untrack(record.requestId);
    }
  }

  return { resumed, pruned: pruned.length, failed };
}
