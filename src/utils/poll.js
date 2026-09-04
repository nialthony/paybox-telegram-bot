import { logger } from '../logger.js';
import { statusLabel, isPending } from '../paybox/client.js';

/**
 * Request polling helper.
 *
 * Polls a Paybox request with `get_request` until it reaches a terminal
 * status, editing the Telegram status message in place as it progresses.
 * Active pollers are tracked so the bot can cancel them on shutdown.
 */

const activePollers = new Set();
let stopped = false;

export function stopAllPollers() {
  stopped = true;
  for (const token of activePollers) {
    token.cancelled = true;
  }
  activePollers.clear();
}

export function resetPollers() {
  stopped = false;
}

export function pollerCount() {
  return activePollers.size;
}

/**
 * Poll a request and edit `messageId` in `chatId` until completion.
 *
 * @param {object}   args
 * @param {Function} args.client       Paybox client
 * @param {string}   args.requestId    request id to poll
 * @param {object}   args.bot          Telegraf bot
 * @param {number}   args.chatId       chat id
 * @param {number}   args.messageId    message to edit in place
 * @param {Function} args.render       (request, state) => string  — status message
 * @param {Function} args.onDone       (request) => void|Promise — terminal handler
 * @param {number}   [args.intervalMs] polling interval
 * @param {number}   [args.timeoutMs]  overall ceiling
 * @param {string}   [args.timeoutMsg] message shown when the ceiling is hit
 */
export async function pollRequest({
  client,
  requestId,
  bot,
  chatId,
  messageId,
  render,
  onDone,
  intervalMs = 4000,
  timeoutMs = 10 * 60 * 1000,
  timeoutMsg = '⏱️ Still pending. I stopped watching — run /history to check later.',
}) {
  const token = { cancelled: false };
  activePollers.add(token);
  const deadline = Date.now() + timeoutMs;
  let lastStatus = '';

  const done = () => activePollers.delete(token);

  try {
    for (;;) {
      if (stopped || token.cancelled) {
        done();
        return { status: 'cancelled' };
      }
      if (Date.now() > deadline) {
        try {
          await bot.telegram.editMessageText(chatId, messageId, undefined, timeoutMsg);
        } catch {}
        done();
        return { status: 'timeout' };
      }

      let request;
      try {
        request = await client.getRequest(requestId);
      } catch (error) {
        logger.warn(`poll error for ${requestId}: ${error.message}`);
        await new Promise((r) => setTimeout(r, intervalMs));
        continue;
      }

      if (request.status !== lastStatus) {
        lastStatus = request.status;
        const text = render(request, lastStatus);
        try {
          await bot.telegram.editMessageText(chatId, messageId, undefined, text);
        } catch {}
      }

      if (!isPending(request.status)) {
        await onDone(request);
        done();
        return request;
      }

      await new Promise((r) => setTimeout(r, intervalMs));
    }
  } catch (error) {
    logger.error(`poll crashed for ${requestId}: ${error.message}`);
    done();
    return { status: 'crashed', error };
  }
}

/** Default status-message renderer. */
export function statusRender(request) {
  const label = statusLabel(request.status);
  const reason = request.reason || request.error || request.error_message;
  return `⏳ Request \`${String(request.request_id).slice(0, 10)}…\`\n\nStatus: ${label}${reason ? `\n${reason}` : ''}`;
}
