import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PaymentInputError,
  createPaymentDraft,
  parseAmountToAtomic,
  parsePaymentCommand,
} from '../src/domain/payment.js';
import { getWalletCredentialId } from '../src/commands/pay.js';

test('converts ETH values to 18-decimal atomic units without floating point arithmetic', () => {
  assert.equal(parseAmountToAtomic('1.5', 18), '1500000000000000000');
  assert.equal(parseAmountToAtomic('0.000000000000000001', 18), '1');
});

test('converts SOL values to 9-decimal lamports', () => {
  assert.equal(parseAmountToAtomic('1.5', 9), '1500000000');
  assert.equal(parseAmountToAtomic('0.000000001', 9), '1');
});

test('rejects zero, negative values, exponent notation, and excess precision', () => {
  for (const amount of ['0', '0.0', '-1', '1e3', '1.0000000001']) {
    assert.throws(() => parseAmountToAtomic(amount, 9), PaymentInputError);
  }
});

test('creates a validated ETH payment draft', () => {
  const draft = createPaymentDraft({
    recipient: '0x1111111111111111111111111111111111111111',
    amount: '2.25',
    asset: 'eth',
  });

  assert.deepEqual(draft, {
    recipient: '0x1111111111111111111111111111111111111111',
    asset: 'ETH',
    chain: 'eip155:1',
    token: undefined,
    atomicAmount: '2250000000000000000',
    displayAmount: '2.25',
  });
});

test('creates a validated SOL payment draft', () => {
  const draft = createPaymentDraft({
    recipient: '5EYjJb9TQHYYb9H1X6kzfYy9qCj8Kx4aTqWwVdQ7BvzP',
    amount: '0.01',
    asset: 'SOL',
  });

  assert.equal(draft.atomicAmount, '10000000');
  assert.equal(draft.chain, 'solana:5eykt4UsFv2P6tnw2qTr3tWUomtW5oGS5zgziYyQd53');
});

test('rejects an unsupported asset and address mismatch', () => {
  assert.throws(
    () => createPaymentDraft({
      recipient: '0x1111111111111111111111111111111111111111',
      amount: '1',
      asset: 'USDC',
    }),
    PaymentInputError,
  );

  assert.throws(
    () => createPaymentDraft({
      recipient: 'not-an-address',
      amount: '1',
      asset: 'ETH',
    }),
    PaymentInputError,
  );
});

test('requires direct commands to use a wallet address instead of an unresolved username', () => {
  assert.throws(
    () => parsePaymentCommand('/pay @example 1 ETH'),
    PaymentInputError,
  );
});

test('selects a wallet credential from the documented Paybox grant summary format', () => {
  const credentialId = getWalletCredentialId([
    {
      credential: { id: 'secret_1', credential_type: 'secret' },
      grant: { credential_id: 'secret_1' },
    },
    {
      credential: { id: 'wallet_1', credential_type: 'wallet' },
      grant: { credential_id: 'wallet_1' },
    },
  ]);

  assert.equal(credentialId, 'wallet_1');
});
