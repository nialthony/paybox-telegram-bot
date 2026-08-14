import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';

const baseEnv = {
  TELEGRAM_BOT_TOKEN: 'test-token',
  PAYBOX_API_KEY: 'pbx_live_test',
};

test('configuration keeps wallet transfers disabled by default', () => {
  const config = loadConfig(baseEnv);
  assert.equal(config.walletTransfersEnabled, false);
});

test('configuration rejects transfer enablement without explicit adapter confirmation', () => {
  assert.throws(
    () => loadConfig({ ...baseEnv, ENABLE_WALLET_TRANSFERS: 'true' }),
    /PAYBOX_TRANSFER_ADAPTER_CONFIRMED=true/,
  );
});

test('configuration permits transfer enablement only with the explicit adapter confirmation flag', () => {
  const config = loadConfig({
    ...baseEnv,
    ENABLE_WALLET_TRANSFERS: 'true',
    PAYBOX_TRANSFER_ADAPTER_CONFIRMED: 'true',
  });
  assert.equal(config.walletTransfersEnabled, true);
});

test('production configuration requires a durable database URL', () => {
  assert.throws(
    () => loadConfig({ ...baseEnv, NODE_ENV: 'production' }),
    /DATABASE_URL is required in production/,
  );
});

test('production configuration accepts a database URL and safe reconciliation interval', () => {
  const config = loadConfig({
    ...baseEnv,
    NODE_ENV: 'production',
    DATABASE_URL: 'postgres://paybox:test@localhost:5432/paybox',
    RECONCILIATION_INTERVAL_MS: '10000',
  });
  assert.equal(config.databaseUrl, 'postgres://paybox:test@localhost:5432/paybox');
  assert.equal(config.reconciliationIntervalMs, 10000);
});

test('configuration rejects an overly aggressive reconciliation interval', () => {
  assert.throws(
    () => loadConfig({ ...baseEnv, RECONCILIATION_INTERVAL_MS: '1000' }),
    /RECONCILIATION_INTERVAL_MS must be an integer/,
  );
});
