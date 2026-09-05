import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PendingStore } from '../src/store/pending.js';
import { resumePendingRequests, PENDING_MAX_AGE_MS } from '../src/resume.js';
import { driveTransferToCompletion, stopBackgroundWatchers } from '../src/commands/transfer.js';
import { CHAINS } from '../src/utils/tokens.js';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'paybox-resume-'));
}

function makeTelegram() {
  const state = { edits: [] };
  state.telegram = {
    editMessageText: async (chatId, messageId, _, text) => {
      state.edits.push({ chatId, messageId, text });
      return true;
    },
  };
  return state;
}

const FAST_CONFIG = {
  pollIntervalMs: 2,
  requestTimeoutMs: 80,
  txConfirmTimeoutMs: 500,
  payboxSigningKey: 'test-key',
  rpc: { ethereum: 'http://localhost:8545', base: 'http://localhost:8545', solana: 'http://localhost:8899' },
};

test('resume drives a pending transfer to completion and untracks it', async () => {
  const dir = tmpDir();
  const pending = new PendingStore({ dir });
  pending.track({
    requestId: 'req_1',
    kind: 'transfer',
    chatId: 42,
    messageId: 10,
    intent: { op: 'transaction', transaction: {} },
    chainKey: 'ethereum',
    recipient: '0xabc',
    amount: 1,
    tokenSymbol: 'ETH',
  });

  const state = makeTelegram();
  const drove = [];
  const paybox = { getRequest: async () => ({ request_id: 'req_1', status: 'success' }) };

  const result = await resumePendingRequests({
    config: FAST_CONFIG,
    paybox,
    telegram: state.telegram,
    pending,
    stats: { hit() {} },
    drive: async (env) => {
      drove.push(env);
      env.pending?.untrack(env.request.request_id); // the real drive untracks on success
      return { ok: true, txId: '0xtx' };
    },
  });

  assert.deepEqual(result, { resumed: 1, pruned: 0, failed: 0 });
  assert.equal(drove.length, 1);
  assert.equal(drove[0].chatId, 42);
  assert.equal(drove[0].messageId, 10);
  assert.equal(drove[0].chain.key, 'ethereum');
  assert.equal(drove[0].recipient, '0xabc');
  assert.equal(pending.size(), 0);
});

test('resume prunes ancient records and tells the user', async () => {
  const dir = tmpDir();
  const pending = new PendingStore({ dir });
  pending.track({
    requestId: 'req_old',
    kind: 'transfer',
    chatId: 1,
    messageId: 1,
    intent: {},
    chainKey: 'ethereum',
    recipient: '0x',
    amount: 1,
    createdAt: new Date(Date.now() - PENDING_MAX_AGE_MS - 60_000).toISOString(),
  });

  const state = makeTelegram();
  const result = await resumePendingRequests({
    config: FAST_CONFIG,
    paybox: { getRequest: async () => ({ status: 'success' }) },
    telegram: state.telegram,
    pending,
    drive: async () => ({ ok: true }),
  });

  assert.deepEqual(result, { resumed: 0, pruned: 1, failed: 0 });
  assert.equal(pending.size(), 0);
  assert.ok(state.edits.some((e) => /stopped tracking/.test(e.text)));
});

test('resume untracks unknown kinds and survives per-record failures', async () => {
  const dir = tmpDir();
  const pending = new PendingStore({ dir });
  pending.track({ requestId: 'req_swap', kind: 'swap', chatId: 1, messageId: 1 });
  pending.track({ requestId: 'req_bad', kind: 'transfer', chatId: 2, messageId: 2, chainKey: 'nope', intent: {}, recipient: '0x', amount: 1 });

  const state = makeTelegram();
  const result = await resumePendingRequests({
    config: FAST_CONFIG,
    paybox: { getRequest: async (id) => ({ request_id: id, status: 'pending_approval' }) },
    telegram: state.telegram,
    pending,
    drive: async () => {
      throw new Error('boom');
    },
  });

  assert.equal(result.failed, 1); // the bad chain record errored…
  assert.equal(pending.size(), 0); // …and was untracked; the swap kind was dropped
  assert.ok(state.edits.some((e) => /Could not resume/.test(e.text)));
});

test('driveTransferToCompletion: approved-while-down → sign → broadcast → watch', async () => {
  const dir = tmpDir();
  const pending = new PendingStore({ dir });
  const state = makeTelegram();
  pending.track({
    requestId: 'req_2',
    kind: 'transfer',
    chatId: 5,
    messageId: 6,
    intent: { op: 'transaction', transaction: {} },
    chainKey: 'ethereum',
    recipient: '0xabc',
    amount: 1,
    tokenSymbol: 'ETH',
  });

  let getRequestCalls = 0;
  const paybox = {
    getRequest: async (id) => {
      getRequestCalls += 1;
      if (getRequestCalls === 1) return { request_id: id, status: 'pending_signature' };
      return {
        request_id: id,
        status: 'success',
        output: { value: { serializedTransaction: '0xsigned' } },
      };
    },
  };

  const signed = [];
  const broadcasts = [];
  const watched = [];

  const result = await driveTransferToCompletion({
    config: FAST_CONFIG,
    paybox,
    telegram: state.telegram,
    chatId: 5,
    messageId: 6,
    request: { request_id: 'req_2', status: 'pending_signature' },
    intent: { op: 'transaction', transaction: {} },
    chain: CHAINS.ethereum,
    recipient: '0xabc',
    amount: 1,
    pending,
    stats: { hit() {} },
    sign: async (client, id, intent, key) => { signed.push({ id, key }); },
    broadcast: async () => { broadcasts.push(1); return '0xtxhash'; },
    watch: async (env) => { watched.push(env); return 'final'; },
  });

  assert.equal(result.ok, true);
  assert.equal(result.txId, '0xtxhash');
  assert.deepEqual(signed, [{ id: 'req_2', key: FAST_CONFIG.payboxSigningKey }]);
  assert.equal(broadcasts.length, 1);
  assert.equal(watched.length, 1);
  assert.equal(watched[0].txId, '0xtxhash');
  assert.equal(watched[0].chain.key, 'ethereum');
  assert.equal(pending.size(), 0); // untracked after the broadcast was handed off
  assert.ok(state.edits.some((e) => /Broadcasting/.test(e.text)));
});

test('driveTransferToCompletion: denied request → final message + untrack', async () => {
  const dir = tmpDir();
  const pending = new PendingStore({ dir });
  const state = makeTelegram();

  const result = await driveTransferToCompletion({
    config: FAST_CONFIG,
    paybox: { getRequest: async (id) => ({ request_id: id, status: 'denied', reason: 'user said no' }) },
    telegram: state.telegram,
    chatId: 1,
    messageId: 2,
    request: { request_id: 'req_3', status: 'denied', reason: 'user said no' },
    intent: {},
    chain: CHAINS.solana,
    recipient: 'r',
    amount: 1,
    pending,
    stats: { hit() {} },
    sign: async () => {},
    broadcast: async () => 'sig',
    watch: async () => 'final',
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 'denied');
  assert.equal(pending.size(), 0);
  assert.ok(state.edits.some((e) => /user said no/.test(e.text)));
});

test('driveTransferToCompletion: approval timeout stays tracked + background watch is cancellable', async () => {
  const dir = tmpDir();
  const pending = new PendingStore({ dir });
  const state = makeTelegram();
  pending.track({
    requestId: 'req_4',
    kind: 'transfer',
    chatId: 1,
    messageId: 2,
    intent: {},
    chainKey: 'ethereum',
    recipient: '0xabc',
    amount: 1,
    tokenSymbol: 'ETH',
  });

  try {
    const result = await driveTransferToCompletion({
      config: FAST_CONFIG,
      paybox: { getRequest: async (id) => ({ request_id: id, status: 'pending_approval' }) },
      telegram: state.telegram,
      chatId: 1,
      messageId: 2,
      request: { request_id: 'req_4', status: 'pending_approval' },
      intent: {},
      chain: CHAINS.ethereum,
      recipient: '0xabc',
      amount: 1,
      pending,
      stats: { hit() {} },
      sign: async () => {},
      broadcast: async () => '0x',
      watch: async () => 'final',
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, 'watching');
    assert.equal(pending.size(), 1); // still tracked — a restart resumes it
    assert.ok(state.edits.some((e) => /Still waiting for approval/.test(e.text)));

    // graceful shutdown cancels the detached watcher without untracking
    stopBackgroundWatchers();
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(pending.size(), 1);
  } finally {
    stopBackgroundWatchers();
  }
});
