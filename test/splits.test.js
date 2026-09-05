import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SplitsStore, splitEvenly, microToAmount, amountToMicro } from '../src/store/splits.js';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'paybox-splits-'));
}

function makeStore() {
  return new SplitsStore({ dir: tmpDir() });
}

test('splitEvenly divides evenly', () => {
  assert.deepEqual(splitEvenly('30000000000', 3), [10000000000n, 10000000000n, 10000000000n]);
});

test('splitEvenly assigns dust to the last participant (the payer)', () => {
  // 10 / 3 = 3.333333333… (9-decimal micro units)
  const shares = splitEvenly('10000000000', 3);
  assert.equal(shares[0], 3333333333n);
  assert.equal(shares[1], 3333333333n);
  assert.equal(shares[2], 3333333334n); // payer absorbs the dust
  assert.equal(shares.reduce((a, b) => a + b, 0n), 10000000000n);
});

test('micro/amount conversions round-trip', () => {
  assert.equal(microToAmount('30000000000'), '30');
  assert.equal(microToAmount('3333333333'), '3.333333333');
  assert.equal(microToAmount('500000000'), '0.5');
  assert.equal(amountToMicro('30'), '30000000000');
  assert.equal(amountToMicro('0.09'), '90000000');
  assert.equal(amountToMicro(microToAmount('3333333334')), '3333333334');
});

test('splits store creates a split with resolved shares', () => {
  const store = makeStore();
  const split = store.create({
    chatId: 42,
    createdBy: 1,
    payerHandle: 'alice',
    description: 'team lunch',
    totalAmount: 30,
    tokenSymbol: 'ETH',
    chainKey: 'ethereum',
    chainLabel: 'Ethereum',
    participants: [{ handle: 'bob', address: '0xbob' }, { handle: 'carol', address: '0xcarol' }],
  });

  assert.equal(split.id, 'spl_1');
  assert.equal(split.status, 'open');
  assert.equal(split.participants.length, 3); // bob, carol + payer
  const payer = split.participants.find((p) => p.isPayer);
  assert.equal(payer.handle, 'alice');
  assert.equal(store.participant(split, '@Bob').handle, 'bob'); // handle-normalized lookup
  assert.ok(store.isSettled(split.id) === false);
});

test('splits markPaid settles when everyone has paid', () => {
  const store = makeStore();
  const split = store.create({
    chatId: 1, createdBy: 1, payerHandle: 'alice', description: 'd',
    totalAmount: 0.09, tokenSymbol: 'ETH', chainKey: 'ethereum', chainLabel: 'Ethereum',
    participants: [{ handle: 'bob', address: '0x1' }],
  });

  store.markPaid(split.id, 'bob', { txId: '0xtx', how: 'transfer' });
  assert.ok(store.isSettled(split.id) === false);

  store.markPaid(split.id, '@alice', { how: 'external' });
  assert.ok(store.isSettled(split.id) === true);
  assert.equal(store.get(split.id).status, 'settled');

  // idempotent
  store.markPaid(split.id, 'bob', {});
  assert.equal(store.get(split.id).participants.find((p) => p.handle === 'bob').paid.txId, '0xtx');
});

test('splits markPaid rejects strangers', () => {
  const store = makeStore();
  const split = store.create({
    chatId: 1, createdBy: 1, payerHandle: 'alice', description: 'd',
    totalAmount: 1, tokenSymbol: 'ETH', chainKey: 'ethereum', chainLabel: 'Ethereum',
    participants: [{ handle: 'bob', address: '0x1' }],
  });
  assert.throws(() => store.markPaid(split.id, 'mallory'), /not part of/);
  assert.throws(() => store.markPaid('spl_999', 'bob'), /unknown split/);
});

test('splits cancel + list filtering + persistence', () => {
  const dir = tmpDir();
  const store = new SplitsStore({ dir });
  const a = store.create({
    chatId: 1, createdBy: 1, payerHandle: 'alice', description: 'one',
    totalAmount: 1, tokenSymbol: 'ETH', chainKey: 'ethereum', chainLabel: 'Ethereum',
    participants: [{ handle: 'bob', address: '0x1' }],
  });
  store.create({
    chatId: 2, createdBy: 2, payerHandle: 'dave', description: 'two',
    totalAmount: 2, tokenSymbol: 'SOL', chainKey: 'solana', chainLabel: 'Solana',
    participants: [{ handle: 'erin', address: '0x2' }],
  });

  assert.equal(store.list({ chatId: 1 }).length, 1);
  assert.equal(store.list().length, 2);

  store.cancel(a.id);
  assert.equal(store.get(a.id).status, 'cancelled');
  assert.equal(store.list({ chatId: 1 }).length, 0); // open only by default
  assert.equal(store.list({ chatId: 1, includeClosed: true }).length, 1);

  // survives restart
  const reloaded = new SplitsStore({ dir });
  assert.equal(reloaded.get(a.id).status, 'cancelled');
  assert.equal(reloaded.list().length, 1);
});

test('splits rejects too many participants', () => {
  const store = makeStore();
  const many = Array.from({ length: 30 }, (_, i) => ({ handle: `u${i}`, address: `0x${i}` }));
  assert.throws(() => store.create({
    chatId: 1, createdBy: 1, payerHandle: 'alice', description: 'x',
    totalAmount: 1, tokenSymbol: 'ETH', chainKey: 'ethereum', chainLabel: 'Ethereum',
    participants: many,
  }), /too many participants/);
});
