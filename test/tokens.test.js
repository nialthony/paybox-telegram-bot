import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHAINS, TOKENS, resolveToken, toSmallestUnit, fromSmallestUnit, explorerTxUrl } from '../src/utils/tokens.js';

test('chain catalog is CAIP-2', () => {
  assert.equal(CHAINS.ethereum.id, 'eip155:1');
  assert.equal(CHAINS.base.id, 'eip155:8453');
  assert.ok(CHAINS.solana.id.startsWith('solana:'));
});

test('resolveToken handles aliases and case', () => {
  assert.equal(resolveToken('eth').token.symbol, 'ETH');
  assert.equal(resolveToken('ETH').chain.key, 'ethereum');
  assert.equal(resolveToken('usdc').chain.key, 'ethereum');
  assert.equal(resolveToken('base').chain.key, 'base');
  assert.equal(resolveToken('USDC_SOL').chain.key, 'solana');
  assert.equal(resolveToken('sol').token.address, 'native');
  assert.equal(resolveToken('DOGE'), null);
  assert.equal(resolveToken(null), null);
});

test('solana swaps must use mint addresses, never symbols', () => {
  const { token } = resolveToken('USDC_SOL');
  assert.equal(token.address, 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
});

test('toSmallestUnit / fromSmallestUnit round-trip', () => {
  assert.equal(toSmallestUnit(0.5, TOKENS.ETH), '500000000000000000');
  assert.equal(toSmallestUnit('2', TOKENS.SOL), '2000000000');
  assert.equal(fromSmallestUnit('500000000000000000', 18), 0.5);
  assert.equal(fromSmallestUnit('2000000000', 9), 2);
});

test('explorer urls', () => {
  assert.equal(explorerTxUrl(CHAINS.ethereum, '0xabc'), 'https://etherscan.io/tx/0xabc');
  assert.equal(explorerTxUrl(CHAINS.solana, 'sig'), 'https://solscan.io/tx/sig');
});
