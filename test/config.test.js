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
