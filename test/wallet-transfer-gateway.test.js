import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WalletTransferGatewayError,
  createWalletTransferGateway,
} from '../src/services/wallet-transfer-gateway.js';

test('transfer adapter is disabled by default and does not invoke the provider', async () => {
  const gateway = createWalletTransferGateway({ paybox: {}, enabled: false });
  assert.equal(gateway.enabled, false);
  await assert.rejects(() => gateway.createTransferRequest({}), WalletTransferGatewayError);
});

test('transfer adapter refuses enablement when the installed SDK lacks requestTransfer', () => {
  assert.throws(
    () => createWalletTransferGateway({ paybox: {}, enabled: true }),
    WalletTransferGatewayError,
  );
});

test('transfer adapter passes only validated draft fields to the provider', async () => {
  let payload;
  const gateway = createWalletTransferGateway({
    enabled: true,
    paybox: {
      async requestTransfer(request) {
        payload = request;
        return { status: 'pending_approval' };
      },
      async getRequest() {
        return { request_id: 'request_1', status: 'pending_approval' };
      },
    },
  });

  await gateway.createTransferRequest({
    credentialId: 'credential_1',
    draft: {
      chain: 'eip155:1',
      recipient: '0x1111111111111111111111111111111111111111',
      atomicAmount: '1000000000000000000',
      token: undefined,
    },
  });

  assert.deepEqual(payload, {
    credentialId: 'credential_1',
    chain: 'eip155:1',
    to: '0x1111111111111111111111111111111111111111',
    amount: '1000000000000000000',
  });
});
