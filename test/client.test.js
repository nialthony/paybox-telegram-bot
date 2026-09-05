import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeCredentialList,
  walletsOf,
  cardsOf,
  walletAddress,
  walletFamily,
  statusLabel,
  isPending,
  requestArtifact,
} from '../src/paybox/client.js';

test('normalizeCredentialList handles the current flat shape', () => {
  const raw = {
    credentials: [
      {
        credential_id: 'w1',
        name: 'Trading wallet',
        kind: 'wallet',
        metadata: { address: '0xabc', chains: ['evm'] },
        approval_mode: 'autonomous',
      },
      {
        credential_id: 'c1',
        name: 'Visa',
        kind: 'card',
        metadata: { brand: 'VISA', last4: '4242' },
        approval_mode: 'always_approve',
      },
    ],
    ungranted_summary: { wallet: { evm: 1, solana: 0 }, card: 0, secret: 0 },
  };

  const { credentials, ungranted } = normalizeCredentialList(raw);
  assert.equal(credentials.length, 2);
  assert.equal(credentials[0].id, 'w1');
  assert.equal(credentials[0].kind, 'wallet');
  assert.equal(credentials[0].approvalMode, 'autonomous');
  assert.equal(ungranted.wallet.evm, 1);
});

test('normalizeCredentialList handles the legacy nested shape', () => {
  const raw = {
    credentials: [
      {
        credential: {
          id: 'w9',
          name: 'Old wallet',
          credential_type: 'wallet',
          metadata: { address: '0xdef' },
        },
        grant: { credential_id: 'w9', approval_mode: 'iframe' },
      },
    ],
    ungranted: [],
  };

  const { credentials } = normalizeCredentialList(raw);
  assert.equal(credentials[0].id, 'w9');
  assert.equal(credentials[0].kind, 'wallet');
  assert.equal(credentials[0].approvalMode, 'iframe');
});

test('normalizeCredentialList tolerates junk', () => {
  const { credentials, ungranted } = normalizeCredentialList(null);
  assert.deepEqual(credentials, []);
  assert.equal(ungranted, null);
});

test('filters and address helpers', () => {
  const { credentials } = normalizeCredentialList({
    credentials: [
      { credential_id: 'w', kind: 'wallet', metadata: { address: '0xabc', chains: ['solana'] } },
      { credential_id: 'c', kind: 'card', metadata: { last4: '4242' } },
    ],
  });
  assert.equal(walletsOf(credentials).length, 1);
  assert.equal(cardsOf(credentials).length, 1);
  assert.equal(walletAddress(walletsOf(credentials)[0]), '0xabc');
  assert.equal(walletFamily(walletsOf(credentials)[0]), 'solana');
});

test('status helpers', () => {
  assert.equal(statusLabel('pending_approval'), '🟡 waiting for your approval');
  assert.equal(isPending('pending_settlement'), true);
  assert.equal(isPending('success'), false);
  assert.equal(isPending('denied'), false);
});

test('requestArtifact tolerates wire variants', () => {
  assert.equal(requestArtifact({ output: { value: { signature: '0xsig' } } }).signature, '0xsig');
  assert.equal(requestArtifact({ output: { signature: '0xflat' } }).signature, '0xflat');
  assert.equal(requestArtifact({}), null);
});
