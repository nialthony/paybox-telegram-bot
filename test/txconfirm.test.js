import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHAINS } from '../src/utils/tokens.js';
import { renderTxStatus, watchTransaction, stopAllTxWatchers, txWatcherCount } from '../src/utils/txconfirm.js';

function makeTelegram() {
  const state = { edits: [] };
  state.telegram = {
    editMessageText: async (chatId, messageId, _, text) => {
      state.edits.push(text);
      return true;
    },
  };
  return state;
}

test('renderTxStatus: broadcast stage links the explorer', () => {
  const text = renderTxStatus({ stage: 'broadcast', chain: CHAINS.ethereum, txId: '0xdeadbeef' });
  assert.match(text, /Broadcast to Ethereum/);
  assert.match(text, /etherscan\.io\/tx\/0xdeadbeef/);
  assert.match(text, /Waiting for inclusion/);
});

test('renderTxStatus: included → final → reverted stages', () => {
  const included = renderTxStatus({ stage: 'included', chain: CHAINS.base, txId: '0x1', blockNumber: 123, confirmations: 3 });
  assert.match(included, /Included on Base/);
  assert.match(included, /Block: 123/);
  assert.match(included, /3\/12 confirmations/);

  const final = renderTxStatus({ stage: 'final', chain: CHAINS.base, txId: '0x1', blockNumber: 123, confirmations: 12 });
  assert.match(final, /Final on Base/);

  const reverted = renderTxStatus({ stage: 'reverted', chain: CHAINS.ethereum, txId: '0x1' });
  assert.match(reverted, /Reverted/);
  assert.match(reverted, /not/);

  const solana = renderTxStatus({ stage: 'final', chain: CHAINS.solana, txId: 'sig123' });
  assert.match(solana, /solscan\.io\/tx\/sig123/);
});

test('watcher live-edits through included → final', async () => {
  const state = makeTelegram();
  let calls = 0;
  const probe = {
    status: async () => {
      calls += 1;
      if (calls === 1) return { stage: 'included', blockNumber: 100, confirmations: 1 };
      return { stage: 'final', blockNumber: 100, confirmations: 12 };
    },
  };

  const stage = await watchTransaction({
    telegram: state.telegram,
    chatId: 1,
    messageId: 2,
    chain: CHAINS.ethereum,
    txId: '0xabc',
    intervalMs: 5,
    timeoutMs: 2000,
    probe,
  });

  assert.equal(stage, 'final');
  assert.equal(txWatcherCount(), 0);
  assert.ok(state.edits.length >= 3);
  assert.match(state.edits[0], /Broadcast/);
  assert.match(state.edits[1], /Included/);
  assert.match(state.edits[state.edits.length - 1], /Final/);
});

test('watcher reports reverted transactions', async () => {
  const state = makeTelegram();
  const probe = { status: async () => ({ stage: 'reverted', blockNumber: 5 }) };

  const stage = await watchTransaction({
    telegram: state.telegram, chatId: 1, messageId: 2,
    chain: CHAINS.ethereum, txId: '0xrev', intervalMs: 5, timeoutMs: 500, probe,
  });

  assert.equal(stage, 'reverted');
  assert.match(state.edits[state.edits.length - 1], /Reverted/);
});

test('watcher times out gracefully with an explorer link', async () => {
  const state = makeTelegram();
  const probe = { status: async () => ({ stage: 'pending' }) };

  const stage = await watchTransaction({
    telegram: state.telegram, chatId: 1, messageId: 2,
    chain: CHAINS.solana, txId: 'sigtimeout', intervalMs: 5, timeoutMs: 40, probe,
  });

  assert.equal(stage, 'timeout');
  assert.match(state.edits[state.edits.length - 1], /Still confirming/);
});

test('watcher failure stage (solana err) surfaces the error', async () => {
  const state = makeTelegram();
  const probe = { status: async () => ({ stage: 'failed', error: 'InstructionError' }) };

  const stage = await watchTransaction({
    telegram: state.telegram, chatId: 1, messageId: 2,
    chain: CHAINS.solana, txId: 'sigfail', intervalMs: 5, timeoutMs: 500, probe,
  });

  assert.equal(stage, 'failed');
  assert.match(state.edits[state.edits.length - 1], /Failed on Solana/);
  assert.match(state.edits[state.edits.length - 1], /InstructionError/);
});

test('stopAllTxWatchers cancels in-flight watchers', async () => {
  const state = makeTelegram();
  const probe = { status: async () => ({ stage: 'pending' }) };

  const watching = watchTransaction({
    telegram: state.telegram, chatId: 1, messageId: 2,
    chain: CHAINS.ethereum, txId: '0xslow', intervalMs: 10, timeoutMs: 60_000, probe,
  });
  assert.equal(txWatcherCount(), 1);
  stopAllTxWatchers();
  assert.equal(await watching, 'broadcast');
  assert.equal(txWatcherCount(), 0);
});
