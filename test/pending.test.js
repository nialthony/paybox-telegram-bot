import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PendingStore } from '../src/store/pending.js';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'paybox-pending-'));
}

test('pending track / get / list / untrack', () => {
  const store = new PendingStore({ dir: tmpDir() });

  const record = store.track({
    requestId: 'req_1',
    kind: 'transfer',
    chatId: 42,
    messageId: 100,
    intent: { op: 'transaction', transaction: { to: '0xabc' } },
    chainKey: 'ethereum',
    recipient: '0xabc',
    amount: 1,
  });

  assert.equal(record.requestId, 'req_1');
  assert.equal(store.get('req_1').chatId, 42);
  assert.equal(store.size(), 1);
  assert.equal(store.list().length, 1);

  const removed = store.untrack('req_1');
  assert.equal(removed.requestId, 'req_1');
  assert.equal(store.get('req_1'), null);
  assert.equal(store.size(), 0);
  assert.equal(store.untrack('nope'), null);
});

test('pending track requires a requestId', () => {
  const store = new PendingStore({ dir: tmpDir() });
  assert.throws(() => store.track({ chatId: 1 }), /requestId/);
});

test('pending survives a restart (JSON round-trip)', () => {
  const dir = tmpDir();
  const a = new PendingStore({ dir });
  a.track({ requestId: 'req_9', kind: 'transfer', chatId: 7, messageId: 8, intent: { op: 'raw' }, chainKey: 'solana', recipient: 'r', amount: 2 });

  const b = new PendingStore({ dir });
  assert.equal(b.get('req_9').chainKey, 'solana');
  assert.equal(b.list().length, 1);
});

test('pending prune removes only old records', () => {
  const store = new PendingStore({ dir: tmpDir() });
  store.track({ requestId: 'old', chatId: 1, messageId: 1, createdAt: new Date(Date.now() - 25 * 3600_000).toISOString() });
  store.track({ requestId: 'new', chatId: 1, messageId: 2, createdAt: new Date().toISOString() });
  // also a record with no parseable createdAt → kept (fail-safe)
  store.store.mutate((d) => { d.requests['weird'] = { requestId: 'weird', createdAt: 'not-a-date' }; });

  const removed = store.prune(24 * 3600_000);
  assert.equal(removed.length, 1);
  assert.equal(removed[0].requestId, 'old');
  assert.equal(store.get('new').requestId, 'new');
  assert.equal(store.get('weird').requestId, 'weird');
});
