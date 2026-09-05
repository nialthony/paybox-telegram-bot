import { UsageError } from '../middleware/index.js';
import { parseInterval, parseDaily, validateSchedulable } from '../store/jobs.js';
import { describeJob } from '../scheduler.js';
import { formatTimestamp } from '../utils/format.js';

/**
 * /schedule — schedule recurring commands.
 *
 *   /schedule add every <interval> <command…>   e.g. every 6h /price ETH
 *   /schedule add daily <HH:MM> <command…>      e.g. daily 09:00 /balance
 *   /schedule list
 *   /schedule pause <id> · /schedule resume <id> · /schedule cancel <id>
 *
 * Every run goes through the normal command dispatcher — validation and
 * passkey approvals included — so a scheduled /transfer still waits for your
 * approval each time it fires.
 */
export async function scheduleCommand(ctx, args) {
  if (!ctx.jobs) {
    throw new UsageError('❌ Scheduler is unavailable (store not configured).');
  }

  const [sub = '', ...rest] = args;

  if (sub === 'add') return addJob(ctx, rest);
  if (sub === 'list') return listJobs(ctx);
  if (sub === 'cancel') return cancelJob(ctx, rest[0]);
  if (sub === 'pause') return toggleJob(ctx, rest[0], false);
  if (sub === 'resume') return toggleJob(ctx, rest[0], true);

  return usage(ctx);
}

function usage(ctx) {
  const lines = [
    '⏰ **Command scheduler**',
    '',
    '`/schedule add every <interval> <command…>` — repeat on an interval',
    '`/schedule add daily <HH:MM> <command…>` — run daily at a set time',
    '`/schedule list` — this chat\'s jobs',
    '`/schedule pause <id>` / `resume <id>` / `cancel <id>`',
    '',
    '**Examples**',
    '• `/schedule add every 1h /price ETH`',
    '• `/schedule add daily 09:00 /balance`',
    '• `/schedule add every 7d /transfer @alice 0.01 ETH` *(asks for approval each run)*',
    '',
    'Intervals: `30m`, `6h`, `7d`, `1d12h` (min 1 minute). Daily times use the `SCHEDULER_TZ` timezone (default UTC).',
    'Money commands still require your passkey approval on every scheduled run.',
  ];
  return ctx.reply(lines.join('\n'), { parse_mode: 'Markdown', link_preview_options: { is_disabled: true } });
}

async function addJob(ctx, rest) {
  const [kind, spec, ...commandParts] = rest;
  const command = commandParts.join(' ').trim();

  if (!kind || !spec || !command) {
    throw new UsageError('❌ Usage: `/schedule add every 6h /price ETH` or `/schedule add daily 09:00 /balance`.');
  }

  const check = validateSchedulable(command);
  if (!check.ok) {
    throw new UsageError(`❌ Cannot schedule that: ${check.reason}.`);
  }

  let schedule;
  if (kind === 'every') {
    const ms = parseInterval(spec);
    if (!ms) {
      throw new UsageError(`❌ Invalid interval: "${spec}". Use forms like 30m, 6h, 7d, 1d12h (min 1 minute).`);
    }
    schedule = { type: 'interval', ms, label: `every ${spec}` };
  } else if (kind === 'daily') {
    const daily = parseDaily(spec);
    if (!daily) {
      throw new UsageError(`❌ Invalid time: "${spec}". Use HH:MM (24h), e.g. 09:00.`);
    }
    schedule = { type: 'daily', hh: daily.hh, mm: daily.mm, label: `daily ${spec}` };
  } else {
    throw new UsageError('❌ Schedule kind must be `every <interval>` or `daily <HH:MM>`.');
  }

  let job;
  try {
    job = ctx.jobs.add({
      chatId: ctx.chat.id,
      userId: ctx.from?.id ?? null,
      schedule,
      command,
    });
  } catch (error) {
    throw new UsageError(`❌ ${error.message}`);
  }

  await ctx.reply(
    `⏰ **Scheduled** — \`${job.id}\`\n\n\`${job.command}\`\n\nNext run: ${formatTimestamp(new Date(job.nextRunAt).toISOString())} (${ctx.config.schedulerTz})`,
    { parse_mode: 'Markdown', link_preview_options: { is_disabled: true } }
  );
  ctx.stats?.hit('schedule_created');
}

async function listJobs(ctx) {
  const jobs = ctx.jobs.list({ chatId: ctx.chat.id });
  if (jobs.length === 0) {
    await ctx.reply('⏰ No scheduled jobs in this chat. Add one: `/schedule add every 1h /price ETH`.', {
      parse_mode: 'Markdown',
    });
    return;
  }
  const lines = ['⏰ **Scheduled jobs in this chat**', ''];
  for (const job of jobs.slice(0, 20)) {
    lines.push(describeJob(job));
  }
  await ctx.reply(lines.join('\n'), { parse_mode: 'Markdown', link_preview_options: { is_disabled: true } });
}

function requireJob(ctx, id) {
  if (!id) {
    throw new UsageError('❌ Which job? Find ids with /schedule list.');
  }
  const job = ctx.jobs.get(id);
  if (!job || job.chatId !== ctx.chat.id) {
    throw new UsageError(`❌ No scheduled job \`${id}\` in this chat.`);
  }
  return job;
}

async function cancelJob(ctx, id) {
  const job = requireJob(ctx, id);
  ctx.jobs.cancel(id);
  await ctx.reply(`🗑 **Cancelled** — \`${job.id}\` (\`${job.command}\`)`, {
    parse_mode: 'Markdown',
  });
}

async function toggleJob(ctx, id, enabled) {
  requireJob(ctx, id);
  const job = ctx.jobs.setEnabled(id, enabled);
  await ctx.reply(
    enabled
      ? `▶️ **Resumed** — \`${job.id}\`. Next run: ${formatTimestamp(new Date(job.nextRunAt).toISOString())}.`
      : `⏸ **Paused** — \`${job.id}\`.`,
    { parse_mode: 'Markdown' }
  );
}
