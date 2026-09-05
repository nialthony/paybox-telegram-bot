import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Registry } from '../src/store/registry.js';
import { JsonFileStore } from '../src/store/jsonFile.js';

const EVM = '0x742d35cC6634C0532925A3b844BC9E7595F2beb1';
const SOL = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'paybox-test-'));
}

test('registry add / lookup / remove', () => {
  const dir = tmpDir();
  const registry = new Registry({ dir });

  registry.add({ handle: '@Alice', address: EVM, addedBy: 42 });
  assert.equal(registry.byHandle('@alice').address, EVM);
  assert.equal(registry.byAddress(EVM).handle, 'alice');
  assert.equal(registry.size(), 1);

  registry.add({ handle: '@bobby', address: SOL, addedBy: 42 });
  assert.equal(registry.size(), 2);

  const removed = registry.remove('@alice');
  assert.equal(removed.handle, 'alice');
  assert.equal(registry.byHandle('@alice'), null);

  // Persisted across instances
  const registry2 = new Registry({ dir });
  assert.equal(registry2.byHandle('@bobby').address, SOL);
});

test('registry rejects bad input', () => {
  const registry = new Registry({ dir: tmpDir() });
  assert.throws(() => registry.add({ handle: 'noat', address: EVM }), /valid Telegram handle/);
  assert.throws(() => registry.add({ handle: '@okuser', address: '0x123' }), /valid wallet address/);
});

test('jsonFileStore writes atomically and survives corruption', () => {
  const dir = tmpDir();
  const store = new JsonFileStore({ dir, file: 'store.json', defaults: { count: 0 } });

  store.mutate((d) => { d.count += 1; });
  assert.equal(new JsonFileStore({ dir, file: 'store.json', defaults: { count: 0 } }).load().count, 1);

  // Corrupt the file — the store must start fresh instead of crashing.
  fs.writeFileSync(path.join(dir, 'store.json'), '{not json');
  const fresh = new JsonFileStore({ dir, file: 'store.json', defaults: { count: 0 } });
  assert.equal(fresh.load().count, 0);
});

test('registry persists across instances (JSON file round-trip)', () => {
  const dir = tmpDir();
  const a = new Registry({ dir });
  a.add({ handle: '@carol', address: EVM, addedBy: 7 });
  const b = new Registry({ dir });
  assert.equal(b.byHandle('@carol').addedBy, 7);
  assert.ok(b.byHandle('@carol').addedAt);
});
