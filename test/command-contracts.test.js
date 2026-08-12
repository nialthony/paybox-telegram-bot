import test from 'node:test';
import assert from 'node:assert/strict';
import { balanceCommand } from '../src/commands/balance.js';
import { servicesCommand } from '../src/commands/services.js';

function makeContext({ text, paybox }) {
  const replies = [];
  return {
    message: { text },
    from: { id: 123 },
    chat: { id: 456 },
    paybox,
    async reply(message, options) {
      replies.push({ message, options });
    },
    replies,
  };
}

test('balance passes a validated address to the Paybox portfolio method', async () => {
  let portfolioArgs;
  const ctx = makeContext({
    text: '/balance 0x1111111111111111111111111111111111111111',
    paybox: {
      async listCredentials() {
        return [{ credential: { id: 'wallet_1', credential_type: 'wallet' }, grant: {} }];
      },
      async getPortfolio(args) {
        portfolioArgs = args;
        return { total_usd: 12.5, wallets: [], holdings: [] };
      },
    },
  });

  await balanceCommand(ctx);

  assert.deepEqual(portfolioArgs, { address: '0x1111111111111111111111111111111111111111' });
  assert.match(ctx.replies.at(-1).message, /Total value/);
});

test('service discovery passes the optional query as the documented positional argument', async () => {
  let query;
  const ctx = makeContext({
    text: '/services flights',
    paybox: {
      async discoverServices(value) {
        query = value;
        return [{ resource: 'https://example.com/flights', description: 'Book a flight' }];
      },
    },
  });

  await servicesCommand(ctx);

  assert.equal(query, 'flights');
  assert.ok(ctx.replies.at(-1).message.includes('example\\.com'));
});
