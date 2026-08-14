import test from 'node:test';
import assert from 'node:assert/strict';
import { PayboxClient } from '@paybox-sh/sdk';

test('pinned Paybox SDK exposes the read-only methods used by the bot', () => {
  const prototype = PayboxClient.prototype;

  assert.equal(typeof prototype.listCredentials, 'function');
  assert.equal(typeof prototype.getPortfolio, 'function');
  assert.equal(typeof prototype.discoverServices, 'function');
  assert.equal(typeof prototype.getRequest, 'function');
});

test('pinned Paybox SDK does not expose the unverified requestTransfer method', () => {
  assert.equal(typeof PayboxClient.prototype.requestTransfer, 'undefined');
});
