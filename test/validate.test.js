import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isEvmAddress,
  isSolanaAddress,
  isAnyAddress,
  addressFamily,
  isTelegramHandle,
  parseAmount,
  parseUsd,
  isUrl,
  sanitizeText,
  truncateUtf8,
} from '../src/utils/validate.js';

test('isEvmAddress', () => {
  assert.equal(isEvmAddress('0x742d35cC6634C0532925A3b844BC9E7595F2beb1'), true);
  assert.equal(isEvmAddress('0x123'), false);
  assert.equal(isEvmAddress(''), false);
  assert.equal(isEvmAddress(null), false);
});

test('isSolanaAddress', () => {
  // USDC mint — a canonical 44-char base58 address
  assert.equal(isSolanaAddress('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'), true);
  assert.equal(isSolanaAddress('5EUa'), false);
  assert.equal(isSolanaAddress('0x742d35cC6634C0532925A3b844BC9E7595F2beb1'), false);
});

test('addressFamily', () => {
  assert.equal(addressFamily('0x742d35cC6634C0532925A3b844BC9E7595F2beb1'), 'evm');
  assert.equal(addressFamily('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'), 'solana');
  assert.equal(addressFamily('nope'), null);
});

test('isTelegramHandle', () => {
  assert.equal(isTelegramHandle('@cryptoking'), true);
  assert.equal(isTelegramHandle('@ab'), false);
  assert.equal(isTelegramHandle('cryptoking'), false);
});

test('parseAmount', () => {
  assert.equal(parseAmount('1.5'), 1.5);
  assert.equal(parseAmount('0.0001'), 0.0001);
  assert.equal(parseAmount('-1'), null);
  assert.equal(parseAmount('0'), null);
  assert.equal(parseAmount('1e5'), null);
  assert.equal(parseAmount('abc'), null);
  assert.equal(parseAmount(''), null);
  assert.equal(parseAmount('1.12345678901234567890', { maxDecimals: 18 }), null);
  assert.equal(parseAmount('1.123', { maxDecimals: 2 }), null);
});

test('parseUsd', () => {
  assert.equal(parseUsd('19.99'), 1999);
  assert.equal(parseUsd('$5'), 500);
  assert.equal(parseUsd('0.01'), 1);
  assert.equal(parseUsd('0.001'), null);
  assert.equal(parseUsd('free'), null);
});

test('isUrl', () => {
  assert.equal(isUrl('https://acme.com/x'), true);
  assert.equal(isUrl('http://acme.com'), true);
  assert.equal(isUrl('notaurl'), false);
  assert.equal(isUrl('ftp://acme.com'), false);
});

test('sanitizeText strips control chars and truncates', () => {
  assert.equal(sanitizeText('hello\u0000world'), 'helloworld');
  assert.equal(sanitizeText('x'.repeat(2000), 100).length, 100);
});

test('truncateUtf8 respects byte budget', () => {
  const text = 'é'.repeat(100);
  const out = truncateUtf8(text, 10);
  assert.ok(Buffer.byteLength(out) <= 10);
});
