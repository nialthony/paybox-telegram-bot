import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { JobsStore } from '../src/store/jobs.js';
import { runJob, startScheduler, stopScheduler, schedulerRunning } from '../src/scheduler.js';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'paybox-sched-'));
}

function makeDeps() {
  const dir = tmpDir();
  const jobs = new JobsStore({ dir, timeZone: 'UTC' });
  const sent = [];
  const calls = [];
  const dispatcher = {
    price: async (ctx, args) => calls.push({ name: 'price', args, chatId: ctx.chat.id, scheduled: Boolean(ctx.__scheduledJob) }),
    balance: async (ctx, args) => calls.push({ name: 'balance', args, chatId: ctx.chat.id }),
    transfer: async (ctx, args) => {
      if (args.length < 2) throw new Error('transfer needs args');
      calls.push({ name: 'transfer', args });
    },
  };
  const deps = {
    jobs,
    dispatcher,
    config: { schedulerTickMs: 20, schedulerTz: 'UTC', canSign: false, pollIntervalMs: 5, requestTimeoutMs: 100 },
    bot: { telegram: { sendMessage: async (chatId, text) => { sent.push({ chatId, text }); return { message_id: 1 }; } } },
    paybox: {},
    sessions: { obtain: (userId) => ({ userId }) },
    registry: { byHandle: () => null },
    stats: { hit() {} },
  };
  deps.test = { sent, calls };
  return deps;
}

test('runJob routes a due job through the dispatcher with a scheduler context', async () => {
  const deps = makeDeps();
  const job = deps.jobs.add({ chatId: 42, userId: 7, schedule: { type: 'interval', ms: 3600_000 }, command: '/price ETH USD' });

  const result = await runJob(job, deps);
  assert.equal(result.ok, true);
  assert.equal(deps.test.calls.length, 1);
  assert.equal(deps.test.calls[0].name, 'price');
  assert.deepEqual(deps.test.calls[0].args, ['ETH', 'USD']);
  assert.equal(deps.test.calls[0].chatId, 42);
  assert.equal(deps.test.calls[0].scheduled, true);

  // run recorded + rescheduled into the future
  const after = deps.jobs.get(job.id);
  assert.equal(after.runCount, 1);
  assert.equal(after.lastError, null);
  assert.ok(after.nextRunAt > Date.now());
  assert.equal(deps.jobs.due().length, 0);

  // the scheduler preamble went to the chat
  assert.ok(deps.test.sent.some((m) => m.chatId === 42 && /Scheduled run/.test(m.text)));
});

test('runJob maps snake_case commands to dispatcher keys', async () => {
  const deps = makeDeps();
  deps.dispatcher.useService = async (ctx, args) => deps.test.calls.push({ name: 'useService', args });
  const job = deps.jobs.add({ chatId: 1, userId: 1, schedule: { type: 'interval', ms: 60_000 }, command: '/use_service https://x.dev/fetch' });

  const result = await runJob(job, deps);
  assert.equal(result.ok, true);
  assert.equal(deps.test.calls[0].name, 'useService');
  assert.deepEqual(deps.test.calls[0].args, ['https://x.dev/fetch']);
});

test('runJob reports failures and keeps the job scheduled', async () => {
  const deps = makeDeps();
  const job = deps.jobs.add({ chatId: 1, userId: 1, schedule: { type: 'interval', ms: 60_000 }, command: '/transfer' }); // transfer throws on missing args

  const result = await runJob(job, deps);
  assert.equal(result.ok, false);
  assert.match(result.error, /transfer needs args/);
  const after = deps.jobs.get(job.id);
  assert.equal(after.runCount, 1);
  assert.equal(after.lastError, 'transfer needs args');
  assert.ok(after.nextRunAt > Date.now()); // rescheduled, not dropped
  assert.ok(deps.test.sent.some((m) => /failed/.test(m.text)));
});

test('runJob disables a job whose command became invalid (recursion guard)', async () => {
  const deps = makeDeps();
  const job = deps.jobs.add({ chatId: 1, userId: 1, schedule: { type: 'interval', ms: 60_000 }, command: '/price ETH' });
  deps.jobs.store.mutate((d) => { d.jobs[job.id].command = '/schedule list'; }); // simulate a bad command

  const result = await runJob(job, deps);
  assert.equal(result.ok, false);
  assert.match(result.error, /recursion/);
  assert.equal(deps.jobs.get(job.id).enabled, false);
  assert.equal(deps.jobs.due().length, 0);
});

test('scheduler loop fires due jobs', async () => {
  const deps = makeDeps();
  deps.config.schedulerTickMs = 15;
  const job = deps.jobs.add({ chatId: 9, userId: 9, schedule: { type: 'interval', ms: 3600_000 }, command: '/price ETH' });
  deps.jobs.store.mutate((d) => { d.jobs[job.id].nextRunAt = Date.now() - 1000; });

  startScheduler(deps);
  assert.ok(schedulerRunning());
  await new Promise((r) => setTimeout(r, 120));
  stopScheduler();
  assert.equal(schedulerRunning(), false);

  assert.equal(deps.test.calls.length, 1);
  const after = deps.jobs.get(job.id);
  assert.equal(after.runCount, 1);
  assert.ok(after.nextRunAt > Date.now());
});
