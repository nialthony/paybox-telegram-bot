import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requestConfirmation, registerConfirmActions, pendingConfirmCount, stopConfirmCleaner, MONEY_INTENTS } from '../src/utils/confirm.js';

/**
 * Fakes: a bot that records action handlers, a ctx whose replies are
 * captured, and a telegram whose edits are captured.
 */
function makeBot() {
  const handlers = [];
  return {
    handlers,
    action(regex, handler) {
      handlers.push({ regex, handler });
    },
  };
}

function makeCtx(userId = 1, chatId = 2) {
  const state = { replies: [], edits: [] };
  const telegram = {
    editMessageText: async (chatId, messageId, _, text) => {
      state.edits.push(text);
      return true;
    },
  };
  const ctx = {
    from: { id: userId },
    chat: { id: chatId },
    telegram,
    reply: async (text, extra) => {
      state.replies.push({ text, extra });
      return { message_id: 777 };
    },
  };
  ctx.state = state;
  return ctx;
}

function callbackData(ctx) {
  return ctx.state.replies[0].extra.reply_markup.inline_keyboard[0].map((b) => b.callback_data);
}

async function fireAction(bot, data, userId) {
  const match = data.match(/^cfm:([0-9a-f]+):(yes|no|edit)$/);
  const handler = bot.handlers.find((h) => h.regex.test(data));
  assert.ok(handler, `no handler for ${data}`);
  const cbCtx = {
    from: { id: userId ?? 1 },
    match: [data, match[1], match[2]],
    answerCbQuery: async () => true,
  };
  await handler.handler(cbCtx);
}

test('money intents list covers the money movers', () => {
  assert.deepEqual([...MONEY_INTENTS].sort(), ['pay', 'swap', 'transfer', 'use_service']);
});

test('✅ confirms and resolves true', async () => {
  const bot = makeBot();
  registerConfirmActions(bot);
  const ctx = makeCtx(11, 22);

  const promise = requestConfirmation({ ctx, intent: 'transfer', args: ['@alice', '5', 'ETH'], timeoutMs: 60_000 });
  const [yes, editBtn, no] = callbackData(ctx);
  assert.match(yes, /^cfm:[0-9a-f]+:yes$/);
  assert.match(editBtn, /^cfm:[0-9a-f]+:edit$/);
  assert.match(no, /^cfm:[0-9a-f]+:no$/);

  await fireAction(bot, yes, 11);
  assert.equal(await promise, true);
  assert.match(ctx.state.edits[0], /Confirmed/);
  assert.equal(pendingConfirmCount(), 0);
});

test('❌ cancels and resolves false', async () => {
  const bot = makeBot();
  registerConfirmActions(bot);
  const ctx = makeCtx();

  const promise = requestConfirmation({ ctx, intent: 'swap', args: ['ETH', 'SOL', '0.1'] });
  const [, , no] = callbackData(ctx);
  await fireAction(bot, no);
  assert.equal(await promise, false);
  assert.match(ctx.state.edits[0], /Cancelled/);
});

test('✏️ change resolves false without running', async () => {
  const bot = makeBot();
  registerConfirmActions(bot);
  const ctx = makeCtx();

  const promise = requestConfirmation({ ctx, intent: 'pay', args: ['Acme', 'https://acme.dev', '19.99'] });
  const [, editBtn] = callbackData(ctx);
  await fireAction(bot, editBtn);
  assert.equal(await promise, false);
  assert.match(ctx.state.edits[0], /Change it/);
});

test('another user cannot confirm someone else’s request', async () => {
  const bot = makeBot();
  registerConfirmActions(bot);
  const ctx = makeCtx(1, 2);

  const promise = requestConfirmation({ ctx, intent: 'transfer', args: ['@alice', '1', 'ETH'], timeoutMs: 60_000 });
  const [yes] = callbackData(ctx);

  await fireAction(bot, yes, 999); // different user
  assert.equal(pendingConfirmCount(), 1); // still pending
  assert.equal(ctx.state.edits.length, 0);

  await fireAction(bot, yes, 1); // right user
  assert.equal(await promise, true);
});

test('expired confirmations resolve false and edit the card', async () => {
  const ctx = makeCtx();
  const promise = requestConfirmation({ ctx, intent: 'transfer', args: ['@a', '1', 'ETH'], timeoutMs: 40 });
  assert.equal(await promise, false);
  assert.ok(ctx.state.edits.some((t) => /Expired/.test(t)));
});

test('a second request supersedes the first', async () => {
  const ctx = makeCtx(5, 6);
  const first = requestConfirmation({ ctx, intent: 'transfer', args: ['@a', '1', 'ETH'], timeoutMs: 60_000 });
  const second = requestConfirmation({ ctx, intent: 'transfer', args: ['@b', '2', 'ETH'], timeoutMs: 60_000 });

  assert.equal(await first, false);
  assert.ok(ctx.state.edits.some((t) => /Superseded/.test(t)));
  assert.equal(pendingConfirmCount(), 1); // the second one

  stopConfirmCleaner();
  assert.equal(await second, false);
});
