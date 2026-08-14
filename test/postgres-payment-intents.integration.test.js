import test from 'node:test';
import assert from 'node:assert/strict';
import { PostgresPaymentIntentStore } from '../src/services/postgres-payment-intents.js';

const databaseUrl = process.env.TEST_DATABASE_URL;

test('PostgreSQL payment intents persist idempotency and single-use claims', {
  skip: !databaseUrl,
}, async () => {
  const store = PostgresPaymentIntentStore.fromConnectionString({ connectionString: databaseUrl });
  await store.initialize();
  const idempotencyKey = `integration-${Date.now()}`;
  const profileUserId = `tip-user-${Date.now()}`;
  const draft = {
    asset: 'ETH',
    chain: 'eip155:1',
    recipient: '0x1111111111111111111111111111111111111111',
    atomicAmount: '1000000000000000000',
    displayAmount: '1',
  };

  try {
    assert.equal(await store.checkHealth(), true);
    await store.registerWalletProfile({
      telegramUserId: profileUserId,
      telegramUsername: 'integration_tip_user',
      asset: 'SOL',
      walletAddress: '5EYjJb9TQHYYb9H1X6kzfYy9qCj8Kx4aTqWwVdQ7BvzP',
    });
    assert.equal(
      (await store.getWalletProfile({ telegramUsername: 'INTEGRATION_TIP_USER', asset: 'SOL' })).telegramUserId,
      profileUserId,
    );
    assert.equal(
      (await store.getWalletProfile({ telegramUserId: profileUserId, asset: 'SOL' })).walletAddress,
      '5EYjJb9TQHYYb9H1X6kzfYy9qCj8Kx4aTqWwVdQ7BvzP',
    );

    const created = await store.createDraft({
      telegramUserId: 'user-1',
      chatId: 'chat-1',
      draft,
      idempotencyKey,
    });
    const replay = await store.createDraft({
      telegramUserId: 'user-1',
      chatId: 'chat-1',
      draft,
      idempotencyKey,
    });

    assert.equal(replay.id, created.id);
    const claimed = await store.claimForCreation({ id: created.id, telegramUserId: 'user-1', chatId: 'chat-1' });
    assert.equal(claimed.state, 'creating');
    await assert.rejects(
      () => store.claimForCreation({ id: created.id, telegramUserId: 'user-1', chatId: 'chat-1' }),
      /already been processed/,
    );

    const pending = await store.transition(created.id, 'pending_approval', {
      providerRequestId: `provider-${Date.now()}`,
      providerStatus: 'pending_approval',
    });
    assert.equal(pending.state, 'pending_approval');
    assert.equal((await store.listPendingReconciliation()).length, 1);
  } finally {
    await store.pool.query('DELETE FROM payment_intent_events WHERE intent_id IN (SELECT id FROM payment_intents WHERE idempotency_key = $1)', [idempotencyKey]);
    await store.pool.query('DELETE FROM payment_intents WHERE idempotency_key = $1', [idempotencyKey]);
    await store.pool.query('DELETE FROM wallet_profiles WHERE telegram_user_id = $1', [profileUserId]);
    await store.close();
  }
});
