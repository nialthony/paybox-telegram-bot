import crypto from 'node:crypto';
import { logger } from '../logger.js';

/**
 * Confirm-before-send for AI mode.
 *
 * Natural-language money moves (transfer / swap / pay / use_service) are
 * never executed straight away: the bot shows exactly which command it is
 * about to run and waits for a one-tap ✅ / ✏️ / ❌. Nothing moves until
 * the user confirms; the callback is bound to the user who asked, and
 * confirmations expire.
 *
 * Confirmations are deliberately in-memory and short-lived — this is an
 * interactive gate, not durable state.
 */

export const MONEY_INTENTS = new Set(['transfer', 'swap', 'pay', 'use_service']);

const CLEANUP_INTERVAL_MS = 5_000;

const pendingByNonce = new Map(); // nonce → record
const pendingByKey = new Map(); // `${userId}:${chatId}` → nonce
let cleaner = null;

function ensureCleaner() {
  if (cleaner) return;
  cleaner = setInterval(() => {
    const now = Date.now();
    for (const [nonce, record] of pendingByNonce) {
      if (record.expiresAt <= now) {
        settle(nonce, 'timeout');
      }
    }
  }, CLEANUP_INTERVAL_MS);
  if (cleaner.unref) cleaner.unref();
}

/** Resolve a pending confirmation (idempotent). */
function settle(nonce, answer) {
  const record = pendingByNonce.get(nonce);
  if (!record || record.settled) return;
  record.settled = true;
  pendingByNonce.delete(nonce);
  if (pendingByKey.get(record.key) === nonce) pendingByKey.delete(record.key);
  clearTimeout(record.expireTimer);

  const telegram = record.telegram;
  const edit = (text) =>
    telegram
      .editMessageText(record.chatId, record.messageId, undefined, text, { parse_mode: 'Markdown' })
      .catch(() => {});

  switch (answer) {
    case 'yes':
      edit(`✅ **Confirmed** — running it now…`);
      break;
    case 'no':
      edit(`❌ **Cancelled** — nothing was sent.`);
      break;
    case 'edit':
      edit(`✏️ **Change it** — send the corrected request as a new message.`);
      break;
    case 'timeout':
      edit(`⌛ **Expired** — nothing was sent. Ask again when you're ready.`);
      break;
    case 'superseded':
      edit(`🙈 **Superseded** — a newer request replaced this one.`);
      break;
    default:
      edit(`❌ **Cancelled** — nothing was sent.`);
  }
  record.resolve(answer === 'yes');
}

/**
 * Ask the user to confirm a money intent.
 * Resolves true only on an explicit ✅; false on cancel / change / timeout /
 * supersede. Sends the confirmation card via ctx.reply.
 */
export function requestConfirmation({ ctx, intent, args, timeoutMs = 90_000 }) {
  return new Promise((resolve) => {
    const userId = ctx.from?.id ?? null;
    const chatId = ctx.chat?.id;
    const key = `${userId}:${chatId}`;

    // One pending confirmation per user+chat: supersede the previous one.
    const previousNonce = pendingByKey.get(key);
    if (previousNonce) settle(previousNonce, 'superseded');

    const nonce = crypto.randomBytes(5).toString('hex');
    const record = {
      nonce,
      key,
      userId,
      chatId,
      intent,
      args,
      telegram: ctx.telegram,
      messageId: null,
      expiresAt: Date.now() + timeoutMs,
      settled: false,
      resolve,
    };
    pendingByNonce.set(nonce, record);
    pendingByKey.set(key, nonce);
    ensureCleaner();

    const command = `/${intent}${args.length ? ` ${args.join(' ')}` : ''}`;
    const card =
      `⚠️ **Confirm before I run this**\n\n` +
      `\`${command}\`\n\n` +
      `Nothing moves until you confirm.`;

    ctx
      .reply(card, {
        parse_mode: 'Markdown',
        link_preview_options: { is_disabled: true },
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Confirm', callback_data: `cfm:${nonce}:yes` },
              { text: '✏️ Change', callback_data: `cfm:${nonce}:edit` },
              { text: '❌ Cancel', callback_data: `cfm:${nonce}:no` },
            ],
          ],
        },
      })
      .then((message) => {
        record.messageId = message?.message_id ?? null;
      })
      .catch((error) => {
        logger.error(`confirm card failed: ${error.message}`);
        settle(nonce, 'no');
      });

    // Hard-expire even if the cleaner was never started (belt & braces).
    // Deliberately NOT unref'd: resolution of the confirmation promise must
    // not depend on anything else keeping the event loop alive.
    if (!record.settled) {
      record.expireTimer = setTimeout(() => settle(nonce, 'timeout'), timeoutMs + 1000);
    }
  });
}

/**
 * Register the confirmation callback handlers.
 * MUST be registered before the catch-all action handler in setupActions,
 * otherwise the catch-all swallows the callbacks.
 */
export function registerConfirmActions(bot) {
  bot.action(/^cfm:([0-9a-f]+):(yes|no|edit)$/, async (ctx) => {
    const [, nonce, answer] = ctx.match;
    const record = pendingByNonce.get(nonce);

    if (!record) {
      await ctx.answerCbQuery('This confirmation has expired — ask again.').catch(() => {});
      return;
    }
    if (ctx.from?.id !== record.userId) {
      await ctx.answerCbQuery('This is not your confirmation.').catch(() => {});
      return;
    }
    await ctx.answerCbQuery().catch(() => {});
    settle(nonce, answer);
  });
}

export function pendingConfirmCount() {
  return pendingByNonce.size;
}

export function stopConfirmCleaner() {
  if (cleaner) {
    clearInterval(cleaner);
    cleaner = null;
  }
  for (const nonce of [...pendingByNonce.keys()]) settle(nonce, 'no');
}
