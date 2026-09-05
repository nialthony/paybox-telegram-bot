import { validateSchedulable } from './store/jobs.js';
import { formatTimestamp } from './utils/format.js';
import { logger } from './logger.js';

/**
 * Command scheduler.
 *
 * A tick loop that fires due jobs from the JobsStore. Each job executes its
 * command through the normal dispatcher — the same validation and
 * passkey-approval flows as a hand-typed command — so a scheduled transfer
 * still asks for your approval every time it runs.
 *
 * Jobs survive restarts (durable store). A job that missed several intervals
 * while the bot was down runs once and is rescheduled from "now" (never from
 * the missed past), so there is no thundering herd of catch-up runs.
 */

let timer = null;
let running = false;

export function schedulerRunning() {
  return timer !== null;
}

export function stopScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

/**
 * Build the context a scheduled command runs with. It is deliberately the
 * same shape Telegraf commands expect (chat, reply, telegram, config,
 * paybox, registry, sessions, stats, session) so command code cannot tell
 * the difference — and cannot bypass anything by being "scheduled".
 */
function buildJobContext({ bot, job, config, paybox, sessions, registry, stats, dispatcher }) {
  const chatId = job.chatId;
  return {
    chat: { id: chatId, type: 'private' },
    from: { id: job.userId },
    telegram: bot.telegram,
    config,
    paybox,
    canSign: config.canSign && Boolean(paybox),
    sessions,
    registry,
    stats,
    dispatcher,
    session: sessions.obtain(job.userId, { agentHistory: [], ui: {} }),
    __scheduledJob: job,
    reply: (text, extra) => bot.telegram.sendMessage(chatId, text, extra).catch(() => {}),
  };
}

/** Map a slash-command name to its dispatcher key (/use_service → useService). */
function dispatcherKey(commandName) {
  return commandName.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

/**
 * Execute one job: parse the command, route it through the dispatcher,
 * record the run. Returns { ok, error }.
 */
export async function runJob(job, deps) {
  const { bot, config, paybox, sessions, registry, stats, dispatcher, jobs } = deps;

  const check = validateSchedulable(job.command);
  if (!check.ok) {
    // The command became invalid after the job was created — disable it.
    jobs.recordRun(job.id, { ok: false, error: check.reason });
    jobs.setEnabled(job.id, false);
    bot.telegram
      .sendMessage(job.chatId, `⏰ Scheduled job ${job.id} disabled: ${check.reason}.`, { parse_mode: 'Markdown' })
      .catch(() => {});
    return { ok: false, error: check.reason };
  }

  const run = dispatcher[dispatcherKey(check.name)];
  if (!run) {
    const error = `unknown command /${check.name}`;
    jobs.recordRun(job.id, { ok: false, error });
    return { ok: false, error };
  }

  const args = job.command
    .replace(/^\/\w+(?:@\w+)?/, '')
    .trim()
    .split(/\s+/)
    .filter((a) => a !== '');

  const ctx = buildJobContext({ bot, job, config, paybox, sessions, registry, stats, dispatcher });

  bot.telegram
    .sendMessage(job.chatId, `⏰ Scheduled run (\`${job.id}\`): ${job.command}`, {
      parse_mode: 'Markdown',
    })
    .catch(() => {});

  try {
    await run(ctx, args);
    jobs.recordRun(job.id, { ok: true });
    return { ok: true };
  } catch (error) {
    logger.error(`scheduled job ${job.id} failed: ${error.message}`);
    // Command helpers mostly report their own errors in-chat; UsageError
    // text is friendly already, so send it for visibility.
    const text = String(error?.message || error).slice(0, 400);
    bot.telegram
      .sendMessage(job.chatId, `❌ Scheduled job ${job.id} failed: ${text}`, { parse_mode: 'Markdown' })
      .catch(() => {});
    jobs.recordRun(job.id, { ok: false, error: text });
    return { ok: false, error: text };
  }
}

/**
 * Start the scheduler loop. deps: { config, bot, paybox, sessions, registry,
 * stats, dispatcher, jobs }.
 */
export function startScheduler(deps) {
  if (timer) return;
  const { config, jobs } = deps;

  const tick = async () => {
    if (running) return; // one run at a time per process
    running = true;
    try {
      const due = jobs.due(Date.now());
      for (const job of due) {
        try {
          await runJob(job, deps);
        } catch (error) {
          logger.error(`scheduler: job ${job.id} crashed: ${error.message}`);
          try {
            jobs.recordRun(job.id, { ok: false, error: error.message });
          } catch {}
        }
      }
    } finally {
      running = false;
    }
  };

  timer = setInterval(tick, config.schedulerTickMs);
  if (timer.unref) timer.unref();
  const count = jobs.list().length;
  logger.info(`scheduler: started (tick ${config.schedulerTickMs}ms, ${count} job(s), tz ${config.schedulerTz})`);
  return { stop: stopScheduler };
}

/** Human summary of a job (used by /schedule list). */
export function describeJob(job) {
  const when =
    job.schedule.type === 'interval'
      ? `every ${job.schedule.label ?? `${Math.round(job.schedule.ms / 60000)}m`}`
      : `daily ${String(job.schedule.hh).padStart(2, '0')}:${String(job.schedule.mm).padStart(2, '0')}`;
  const state = job.enabled ? '🟢' : '⏸';
  const next = job.enabled ? `next: ${formatTimestamp(new Date(job.nextRunAt).toISOString())}` : 'paused';
  const last = job.lastRunAt ? `last: ${formatTimestamp(job.lastRunAt)}` : 'never run';
  return `${state} \`${job.id}\` ${when} — \`${job.command}\`\n    ${next} · ${last}${job.lastError ? ` · ⚠️ ${job.lastError.slice(0, 60)}` : ''}`;
}
