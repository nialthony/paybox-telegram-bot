import test from 'node:test';
import assert from 'node:assert/strict';
import { PaymentIntentError, PaymentIntentStore } from '../src/services/payment-intents.js';

const draft = {
  recipient: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bEb',
  asset: 'ETH',
  chain: 'eip155:1',
  atomicAmount: '1000000000000000000',
  displayAmount: '1',
};

test('payment intent requires the original Telegram user and chat for confirmation', () => {
  const store = new PaymentIntentStore({ now: () => 1_000 });
  const intent = store.createDraft({ telegramUserId: 11, chatId: 22, draft });

  assert.throws(
    () => store.getOwnedActiveIntent({ id: intent.id, telegramUserId: 12, chatId: 22 }),
    PaymentIntentError,
  );
  assert.throws(
    () => store.getOwnedActiveIntent({ id: intent.id, telegramUserId: 11, chatId: 23 }),
    PaymentIntentError,
  );
  assert.equal(
    store.getOwnedActiveIntent({ id: intent.id, telegramUserId: 11, chatId: 22 }).state,
    'awaiting_confirmation',
  );
});

test('payment intent expires before it can be confirmed', () => {
  let now = 1_000;
  const store = new PaymentIntentStore({ ttlMs: 10, now: () => now });
  const intent = store.createDraft({ telegramUserId: 11, chatId: 22, draft });
  now = 1_010;

  assert.throws(
    () => store.getOwnedActiveIntent({ id: intent.id, telegramUserId: 11, chatId: 22 }),
    /expired/,
  );
});

test('payment intent can be cancelled only by its owner', () => {
  const store = new PaymentIntentStore({ now: () => 1_000 });
  const intent = store.createDraft({ telegramUserId: 11, chatId: 22, draft });

  assert.equal(
    store.cancel({ id: intent.id, telegramUserId: 11, chatId: 22 }).state,
    'cancelled',
  );
  assert.throws(
    () => store.getOwnedActiveIntent({ id: intent.id, telegramUserId: 11, chatId: 22 }),
    PaymentIntentError,
  );
});

test('payment intent can only be claimed once for provider request creation', () => {
  const store = new PaymentIntentStore({ now: () => 1_000 });
  const intent = store.createDraft({ telegramUserId: 11, chatId: 22, draft });

  assert.equal(
    store.claimForCreation({ id: intent.id, telegramUserId: 11, chatId: 22 }).state,
    'creating',
  );
  assert.throws(
    () => store.claimForCreation({ id: intent.id, telegramUserId: 11, chatId: 22 }),
    /already been processed/,
  );
});
