import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { JobsStore, parseInterval, parseDaily, computeNextRun, validateSchedulable, assertValidTimeZone } from '../src/store/jobs.js';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'paybox-jobs-'));
}

function makeStore(timeZone = 'UTC') {
  return new JobsStore({ dir: tmpDir(), timeZone });
}

test('parseInterval accepts compact m/h/d runs', () => {
  assert.equal(parseInterval('30m'), 30 * 60_000);
  assert.equal(parseInterval('6h'), 6 * 3_600_000);
  assert.equal(parseInterval('7d'), 7 * 86_400_000);
  assert.equal(parseInterval('1d12h'), 86_400_000 + 12 * 3_600_000);
  assert.equal(parseInterval(''), null);
  assert.equal(parseInterval('6x'), null);
  assert.equal(parseInterval('1.5h'), null);
  assert.equal(parseInterval('45'), null);
  assert.equal(parseInterval('30s'), null); // sub-minute not supported
  assert.equal(parseInterval('10m'), 600_000); // min boundary ok
  assert.equal(parseInterval('30s'), null);
});

test('parseDaily accepts HH:MM', () => {
  assert.deepEqual(parseDaily('09:00'), { hh: 9, mm: 0 });
  assert.deepEqual(parseDaily('23:59'), { hh: 23, mm: 59 });
  assert.deepEqual(parseDaily('9:05'), { hh: 9, mm: 5 });
  assert.equal(parseDaily('24:00'), null);
  assert.equal(parseDaily('09:60'), null);
  assert.equal(parseDaily('0900'), null);
  assert.equal(parseDaily('noon'), null);
});

test('validateSchedulable blocks recursion and non-commands', () => {
  assert.deepEqual(validateSchedulable('/price ETH'), { ok: true, name: 'price' });
  assert.deepEqual(validateSchedulable('/use_service https://x.dev'), { ok: true, name: 'use_service' });
  assert.deepEqual(validateSchedulable('/transfer@my_bot 0.01 ETH'), { ok: true, name: 'transfer' });

  const bad = validateSchedulable('/schedule list');
  assert.equal(bad.ok, false);
  assert.match(bad.reason, /recursion/);
  assert.equal(validateSchedulable('price ETH').ok, false);
  assert.equal(validateSchedulable('/').ok, false);
});

test('computeNextRun: interval is additive', () => {
  const from = Date.UTC(2026, 0, 1, 12, 0, 0);
  assert.equal(computeNextRun({ type: 'interval', ms: 60_000 }, from), from + 60_000);
});

test('computeNextRun: daily fires at the right UTC time', () => {
  // 12:00 UTC → next 09:00 is tomorrow 09:00 UTC (21h later)
  const from = Date.UTC(2026, 0, 1, 12, 0, 0);
  const next = computeNextRun({ type: 'daily', hh: 9, mm: 0 }, from, 'UTC');
  assert.equal(next, Date.UTC(2026, 0, 2, 9, 0, 0));

  // 08:59:59 → today 09:00 (1s later)
  const early = Date.UTC(2026, 0, 1, 8, 59, 59);
  assert.equal(computeNextRun({ type: 'daily', hh: 9, mm: 0 }, early, 'UTC'), Date.UTC(2026, 0, 1, 9, 0, 0));
});

test('computeNextRun: daily honours a non-UTC timezone', () => {
  // 2026-01-01 12:00 UTC == 19:00 in Asia/Jakarta (UTC+7) → next 09:00 Jakarta is tomorrow 02:00 UTC
  const from = Date.UTC(2026, 0, 1, 12, 0, 0);
  const next = computeNextRun({ type: 'daily', hh: 9, mm: 0 }, from, 'Asia/Jakarta');
  assert.equal(next, Date.UTC(2026, 0, 2, 2, 0, 0));
});

test('assertValidTimeZone rejects garbage, accepts IANA names', () => {
  assert.doesNotThrow(() => assertValidTimeZone('Asia/Jakarta'));
  assert.doesNotThrow(() => assertValidTimeZone('UTC'));
  assert.throws(() => assertValidTimeZone('Not/AZone'), /invalid SCHEDULER_TZ/);
});

test('jobs store add / due / recordRun / pause / cancel', () => {
  const store = makeStore();
  const job = store.add({ chatId: 1, userId: 7, schedule: { type: 'interval', ms: 3600_000 }, command: '/price ETH' });

  assert.equal(job.id, 'job_1');
  assert.equal(job.enabled, true);
  assert.equal(job.nextRunAt > Date.now(), true);
  assert.equal(store.due().length, 0); // not due yet

  // make it due
  store.store.mutate((d) => { d.jobs[job.id].nextRunAt = Date.now() - 1000; });
  assert.equal(store.due().length, 1);

  const after = store.recordRun(job.id, { ok: true });
  assert.equal(after.runCount, 1);
  assert.equal(after.nextRunAt > Date.now(), true);
  assert.equal(store.due().length, 0);

  const paused = store.setEnabled(job.id, false);
  assert.equal(paused.enabled, false);
  store.store.mutate((d) => { d.jobs[job.id].nextRunAt = Date.now() - 1000; });
  assert.equal(store.due().length, 0); // paused jobs are never due

  const resumed = store.setEnabled(job.id, true);
  assert.equal(resumed.enabled, true);
  assert.equal(resumed.nextRunAt > Date.now(), true);

  store.cancel(job.id);
  assert.equal(store.get(job.id), null);
  assert.throws(() => store.cancel(job.id), /unknown job/);
});

test('jobs store validates schedules and caps per chat', () => {
  const store = makeStore();
  assert.throws(() => store.add({ chatId: 1, userId: 1, schedule: { type: 'interval', ms: 1000 }, command: '/balance' }), /at least 1 minute/);
  assert.throws(() => store.add({ chatId: 1, userId: 1, schedule: { type: 'weird' }, command: '/balance' }), /interval or daily/);
  assert.throws(() => store.add({ chatId: 1, userId: 1, schedule: { type: 'interval', ms: 60_000 }, command: '/schedule list' }), /recursion/);
  assert.throws(() => store.add({ chatId: 1, userId: 1, schedule: { type: 'interval', ms: 60_000 }, command: 'balance' }), /must start with/);

  for (let i = 0; i < 25; i++) {
    store.add({ chatId: 9, userId: 1, schedule: { type: 'interval', ms: 60_000 }, command: '/stats' });
  }
  assert.throws(
    () => store.add({ chatId: 9, userId: 1, schedule: { type: 'interval', ms: 60_000 }, command: '/stats' }),
    /already has 25/
  );
});

test('jobs store persists across restarts', () => {
  const dir = tmpDir();
  const a = new JobsStore({ dir, timeZone: 'UTC' });
  a.add({ chatId: 5, userId: 6, schedule: { type: 'daily', hh: 9, mm: 30 }, command: '/balance' });

  const b = new JobsStore({ dir, timeZone: 'UTC' });
  const job = b.list({ chatId: 5 })[0];
  assert.equal(job.schedule.type, 'daily');
  assert.equal(job.command, '/balance');
});
