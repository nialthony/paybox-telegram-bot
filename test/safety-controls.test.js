import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAgentResponse } from '../src/domain/agent-response.js';
import { createRateLimiter } from '../src/middleware/index.js';

test('agent validator rejects action-capable and unknown intents', () => {
  const result = validateAgentResponse({
    intent: 'transfer',
    params: { recipient: '0xabc', amount: '1', asset: 'ETH' },
    reply: 'Sending funds now',
  });

  assert.equal(result.intent, 'chat');
  assert.match(result.reply, /\/help/);
});

test('agent validator accepts only complete payment drafts', () => {
  const incomplete = validateAgentResponse({
    intent: 'payment_draft',
    params: { recipient: '0xabc', amount: '1' },
    reply: 'Drafting payment',
  });
  assert.equal(incomplete.intent, 'chat');

  const complete = validateAgentResponse({
    intent: 'payment_draft',
    params: { recipient: '0xabc', amount: '1', asset: 'eth' },
    reply: 'Drafting payment',
  });
  assert.equal(complete.intent, 'payment_draft');
  assert.equal(complete.params.asset, 'ETH');
});

test('rate limiter blocks requests after the configured window quota', () => {
  let now = 1_000;
  const isAllowed = createRateLimiter({ windowMs: 100, maxRequests: 2, now: () => now });

  assert.equal(isAllowed(7), true);
  assert.equal(isAllowed(7), true);
  assert.equal(isAllowed(7), false);
  now = 1_101;
  assert.equal(isAllowed(7), true);
});
