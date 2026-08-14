import test from 'node:test';
import assert from 'node:assert/strict';
import { PaymentIntentStore } from '../src/services/payment-intents.js';
import { walletCommand } from '../src/commands/wallet.js';
import { parseTipCommand, tipCommand } from '../src/commands/tip.js';

function createContext({ text, replyTo, from = { id: 11, username: 'alice' }, store }) {
  const replies = [];
  return {
    message: { text, reply_to_message: replyTo ? { from: replyTo } : undefined },
    from,
    chat: { id: -1001, type: 'supergroup' },
    paymentIntents: store,
    walletProfiles: store,
    reply: async (message, options) => { replies.push({ message, options }); },
    replies,
  };
}

test('tip parser supports reply-style and explicit username syntax', () => {
  assert.deepEqual(parseTipCommand('tip 0.03 sol'), {
    recipientUsername: null,
    amount: '0.03',
    asset: 'sol',
  });
  assert.deepEqual(parseTipCommand('tip @bobby 2.4 SOL'), {
    recipientUsername: 'bobby',
    amount: '2.4',
    asset: 'SOL',
  });
  assert.throws(() => parseTipCommand('tip @bad 1 SOL'), /valid Telegram username/);
});

test('reply tip resolves the replied-to user’s exact registered wallet', async () => {
  const store = new PaymentIntentStore();
  store.registerWalletProfile({
    telegramUserId: 22,
    telegramUsername: 'bob',
    asset: 'SOL',
    walletAddress: '5EYjJb9TQHYYb9H1X6kzfYy9qCj8Kx4aTqWwVdQ7BvzP',
  });
  const ctx = createContext({
    text: 'tip 0.03 sol',
    replyTo: { id: 22, username: 'bob', first_name: 'Bob' },
    store,
  });

  await tipCommand(ctx);
  assert.match(ctx.replies[0].message, /Bob/);
  assert.match(ctx.replies[0].message, /0\.03 SOL/);
  assert.match(ctx.replies[0].message, /5EYjJb9/);
  assert.equal(ctx.replies[0].options.reply_markup.inline_keyboard[0][0].text, 'Review and create tip request');
  const [intent] = store.intents.values();
  assert.equal(intent.draft.atomicAmount, '30000000');
  assert.equal(intent.draft.tipRecipientTelegramUserId, '22');

  const noUsernameReply = createContext({
    text: 'tip 0.01 SOL',
    replyTo: { id: 22, first_name: 'Bob' },
    store,
  });
  await tipCommand(noUsernameReply);
  assert.match(noUsernameReply.replies[0].message, /0\.01 SOL/);
});

test('explicit username tip requires a registered wallet and rejects self-tips', async () => {
  const store = new PaymentIntentStore();
  const missing = createContext({ text: 'tip @bobby 2.4 SOL', store });
  await tipCommand(missing);
  assert.match(missing.replies[0].message, /No SOL wallet is registered/);

  store.registerWalletProfile({
    telegramUserId: 11,
    telegramUsername: 'alice',
    asset: 'SOL',
    walletAddress: '5EYjJb9TQHYYb9H1X6kzfYy9qCj8Kx4aTqWwVdQ7BvzP',
  });
  const selfTip = createContext({ text: 'tip @alice 1 SOL', store });
  await tipCommand(selfTip);
  assert.match(selfTip.replies[0].message, /cannot tip yourself/);
});

test('wallet command registers a validated receiving wallet', async () => {
  const store = new PaymentIntentStore();
  const ctx = createContext({ text: '/wallet SOL 5EYjJb9TQHYYb9H1X6kzfYy9qCj8Kx4aTqWwVdQ7BvzP', store });
  ctx.chat = { id: 11, type: 'private' };
  await walletCommand(ctx);
  assert.match(ctx.replies[0].message, /registered/);
  assert.equal(store.getWalletProfile({ telegramUserId: 11, asset: 'SOL' }).walletAddress, '5EYjJb9TQHYYb9H1X6kzfYy9qCj8Kx4aTqWwVdQ7BvzP');

  const groupAttempt = createContext({ text: '/wallet SOL 5EYjJb9TQHYYb9H1X6kzfYy9qCj8Kx4aTqWwVdQ7BvzP', store });
  await walletCommand(groupAttempt);
  assert.match(groupAttempt.replies[0].message, /private chat/);
});
