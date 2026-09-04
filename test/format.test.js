import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  escapeMd,
  shortAddress,
  formatUsd,
  formatAmount,
  formatCents,
  sparkline,
  renderChart,
  pluralize,
} from '../src/utils/format.js';

test('escapeMd escapes Telegram markdown', () => {
  assert.equal(escapeMd('a_b*c'), 'a\\_b\\*c');
  assert.equal(escapeMd(null), '');
});

test('shortAddress', () => {
  assert.equal(shortAddress('0x1234567890abcdef1234567890abcdef12345678'), '0x1234…5678');
  assert.equal(shortAddress('short'), 'short');
  assert.equal(shortAddress(null), '?');
});

test('formatUsd', () => {
  assert.equal(formatUsd(1234.5), '$1,234.50');
  assert.equal(formatUsd(0), '$0.00');
  assert.equal(formatUsd(null), '—');
});

test('formatAmount trims zeros', () => {
  assert.equal(formatAmount(1.50000001), '1.5');
  assert.equal(formatAmount(0.1234, { maxDecimals: 2 }), '0.12');
});

test('formatCents', () => {
  assert.equal(formatCents(1999), '$19.99');
});

test('sparkline renders blocks', () => {
  const out = sparkline([1, 2, 3, 4, 5, 4, 3, 2, 1]);
  assert.equal(typeof out, 'string');
  assert.ok(out.length > 0);
  assert.equal(sparkline([]), '');
  assert.equal(sparkline([NaN, undefined]), '');
});

test('renderChart', () => {
  const chart = renderChart([1, 2, 3, 4, 5], { label: 'TICKER' });
  assert.ok(chart.includes('TICKER'));
  assert.ok(chart.includes('7d change'));
  assert.equal(renderChart([1]), null);
});

test('pluralize', () => {
  assert.equal(pluralize(1, 'wallet'), '1 wallet');
  assert.equal(pluralize(2, 'wallet'), '2 wallets');
});
