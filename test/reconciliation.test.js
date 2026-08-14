import test from 'node:test';
import assert from 'node:assert/strict';
import { mapProviderStatus, reconcilePendingPaymentIntents } from '../src/services/reconciliation.js';

function makeStore(intents) {
  const transitions = [];
  return {
    transitions,
    async listPendingReconciliation() {
      return intents;
    },
    async transition(id, state, patch) {
      transitions.push({ id, state, patch });
      return { ...intents.find((intent) => intent.id === id), state, ...patch };
    },
  };
}

test('maps Paybox statuses conservatively', () => {
  assert.equal(mapProviderStatus('success'), 'succeeded');
  assert.equal(mapProviderStatus('denied'), 'failed');
  assert.equal(mapProviderStatus('error'), 'failed');
  assert.equal(mapProviderStatus('pending_settlement'), 'pending_approval');
  assert.throws(() => mapProviderStatus('unknown'), /Unknown provider request status/);
});

test('reconciles completed and rejected provider requests by request ID', async () => {
  const store = makeStore([
    { id: 'intent_success', providerRequestId: 'req_success', state: 'pending_approval', providerStatus: 'pending_approval' },
    { id: 'intent_failed', providerRequestId: 'req_failed', state: 'pending_approval', providerStatus: 'pending_approval' },
  ]);
  const gateway = {
    async getRequestStatus({ providerRequestId }) {
      return providerRequestId === 'req_success'
        ? { request_id: 'req_success', status: 'success' }
        : { request_id: 'req_failed', status: 'denied', error: 'not approved' };
    },
  };

  const result = await reconcilePendingPaymentIntents({ store, gateway });

  assert.deepEqual(result, { skipped: false, inspected: 2, transitioned: 2, failed: 0 });
  assert.deepEqual(store.transitions.map(({ id, state }) => ({ id, state })), [
    { id: 'intent_success', state: 'succeeded' },
    { id: 'intent_failed', state: 'failed' },
  ]);
  assert.equal(store.transitions[1].patch.lastErrorCode, 'provider_error');
});

test('does not mutate an intent when the provider request ID does not match', async () => {
  const store = makeStore([
    { id: 'intent_1', providerRequestId: 'req_expected', state: 'pending_approval' },
  ]);
  const gateway = {
    async getRequestStatus() {
      return { request_id: 'req_other', status: 'success' };
    },
  };

  const result = await reconcilePendingPaymentIntents({
    store,
    gateway,
    logger: { warn() {} },
  });

  assert.deepEqual(result, { skipped: false, inspected: 1, transitioned: 0, failed: 1 });
  assert.equal(store.transitions.length, 0);
});

test('skips reconciliation when the gateway does not expose status lookup', async () => {
  const result = await reconcilePendingPaymentIntents({
    store: { async listPendingReconciliation() { throw new Error('should not be called'); } },
    gateway: {},
  });

  assert.deepEqual(result, { skipped: true, inspected: 0, transitioned: 0, failed: 0 });
});
