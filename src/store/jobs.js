import { JsonFileStore } from './jsonFile.js';

/**
 * Scheduled / recurring commands.
 *
 * `/schedule add every 6h /price ETH` and `/schedule add daily 09:00
 * /balance` create jobs that the scheduler loop executes at the right time.
 * Every execution runs through the normal command dispatcher — the same
 * validation and passkey-approval flows as a hand-typed command — so a
 * scheduled transfer still waits for your approval each time it fires.
 *
 * Schedules:
 *   { type: 'interval', ms }  — every <ms> (min 1 minute)
 *   { type: 'daily', hh, mm } — daily at hh:mm in the configured timezone
 */

const MIN_INTERVAL_MS = 60 * 1000;
const MAX_JOBS_PER_CHAT = 25;
const MAX_COMMAND_LENGTH = 200;

/** Parse '45m', '6h', '7d', '1d12h' → ms. Returns null when invalid. */
export function parseInterval(text) {
  const raw = String(text || '').trim().toLowerCase();
  if (!raw) return null;
  const matches = [...raw.matchAll(/(\d+)([mhd])/g)];
  if (matches.length === 0) return null;
  if (matches.join('') !== raw.replace(/^every$/, '')) {
    // Reject '6x', '1.5h', '6 h' — only compact m/h/d runs are accepted.
    const consumed = matches.map((m) => m[0]).join('');
    if (consumed !== raw) return null;
  }
  let ms = 0;
  for (const [, n, unit] of matches) {
    const value = Number.parseInt(n, 10);
    if (!Number.isFinite(value)) return null;
    ms += value * (unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000);
  }
  return ms >= MIN_INTERVAL_MS ? ms : null;
}

/** Parse '09:30' / '9:05' → { hh, mm }. Returns null when invalid. */
export function parseDaily(text) {
  const match = String(text || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hh = Number.parseInt(match[1], 10);
  const mm = Number.parseInt(match[2], 10);
  if (hh > 23 || mm > 59) return null;
  return { hh, mm };
}

/**
 * Which dispatcher command a schedule string refers to, and whether it is
 * schedulable at all. `/schedule` itself is rejected (recursion guard).
 */
export function validateSchedulable(commandText) {
  const text = String(commandText || '').trim();
  if (!text.startsWith('/')) {
    return { ok: false, reason: 'the command must start with /' };
  }
  if (text.length > MAX_COMMAND_LENGTH) {
    return { ok: false, reason: `command too long (max ${MAX_COMMAND_LENGTH} chars)` };
  }
  const match = text.match(/^\/([a-z_]+)(?:@\w+)?(?:\s|$)/i);
  if (!match) {
    return { ok: false, reason: 'could not read the command name' };
  }
  const name = match[1].toLowerCase();
  if (name === 'schedule') {
    return { ok: false, reason: 'scheduling /schedule is not allowed (recursion)' };
  }
  return { ok: true, name };
}

/** Wall-clock hour/minute/second of `ms` inside `timeZone`, via Intl. */
function zonedTime(ms, timeZone) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  return {
    h: Number(parts.hour),
    m: Number(parts.minute),
    s: Number(parts.second),
  };
}

/** Validate an IANA timezone name (throws on garbage). */
export function assertValidTimeZone(timeZone) {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone }).format(new Date());
  } catch {
    throw new Error(`invalid SCHEDULER_TZ timezone: ${timeZone}`);
  }
}

/**
 * Next run timestamp for a schedule, strictly after `fromMs`.
 * Daily jobs are exact to the minute inside `timeZone`; DST transitions can
 * shift a run by an hour on the transition day (documented behaviour).
 */
export function computeNextRun(schedule, fromMs = Date.now(), timeZone = 'UTC') {
  if (schedule.type === 'interval') {
    return fromMs + schedule.ms;
  }
  if (schedule.type === 'daily') {
    const { h, m, s } = zonedTime(fromMs, timeZone);
    const msIntoDay = ((h * 60 + m) * 60 + s) * 1000 + (fromMs % 1000);
    const target = (schedule.hh * 60 + schedule.mm) * 60 * 1000;
    let delta = target - msIntoDay;
    if (delta <= 0) delta += 24 * 60 * 60 * 1000;
    return fromMs + delta;
  }
  throw new Error(`unknown schedule type: ${schedule?.type}`);
}

export class JobsStore {
  constructor({ dir, timeZone = 'UTC' }) {
    this.timeZone = timeZone;
    this.store = new JsonFileStore({
      dir,
      file: 'jobs.json',
      defaults: { jobs: {}, seq: 0 },
    });
  }

  add({ chatId, userId, schedule, command }) {
    const check = validateSchedulable(command);
    if (!check.ok) {
      throw new Error(check.reason);
    }
    if (schedule?.type === 'interval') {
      if (!Number.isFinite(schedule.ms) || schedule.ms < MIN_INTERVAL_MS) {
        throw new Error('interval must be at least 1 minute');
      }
    } else if (schedule?.type === 'daily') {
      if (!Number.isInteger(schedule.hh) || !Number.isInteger(schedule.mm) || schedule.hh > 23 || schedule.mm > 59) {
        throw new Error('invalid daily time');
      }
    } else {
      throw new Error('schedule must be interval or daily');
    }

    const existing = this.list({ chatId, includePaused: true });
    if (existing.length >= MAX_JOBS_PER_CHAT) {
      throw new Error(`this chat already has ${MAX_JOBS_PER_CHAT} scheduled jobs`);
    }

    let id = null;
    this.store.mutate((data) => {
      data.seq += 1;
      id = `job_${data.seq}`;
      data.jobs[id] = {
        id,
        chatId,
        userId,
        schedule,
        command: String(command).slice(0, MAX_COMMAND_LENGTH),
        timeZone: this.timeZone,
        createdAt: new Date().toISOString(),
        nextRunAt: computeNextRun(schedule, Date.now(), this.timeZone),
        lastRunAt: null,
        lastError: null,
        runCount: 0,
        enabled: true,
      };
    });
    return this.get(id);
  }

  get(id) {
    return this.store.load().jobs[String(id)] ?? null;
  }

  list({ chatId, includePaused = true } = {}) {
    return Object.values(this.store.load().jobs).filter(
      (j) => (includePaused || j.enabled) && (chatId === undefined || j.chatId === chatId)
    );
  }

  /** Jobs whose nextRunAt has passed (enabled only). */
  due(nowMs = Date.now()) {
    return this.list({ includePaused: false }).filter((j) => j.nextRunAt <= nowMs);
  }

  cancel(id) {
    const job = this.get(id);
    if (!job) throw new Error(`unknown job ${id}`);
    this.store.mutate((data) => {
      delete data.jobs[id];
    });
    return job;
  }

  setEnabled(id, enabled) {
    const job = this.get(id);
    if (!job) throw new Error(`unknown job ${id}`);
    this.store.mutate((data) => {
      data.jobs[id].enabled = Boolean(enabled);
      // A paused job resumes from "now", not from the missed past.
      if (enabled) {
        data.jobs[id].nextRunAt = computeNextRun(data.jobs[id].schedule, Date.now(), data.jobs[id].timeZone);
      }
    });
    return this.get(id);
  }

  /** Record a run and schedule the next one (coalesced from now, never from the missed past). */
  recordRun(id, { ok = true, error = null } = {}) {
    const job = this.get(id);
    if (!job) throw new Error(`unknown job ${id}`);
    this.store.mutate((data) => {
      const record = data.jobs[id];
      record.lastRunAt = new Date().toISOString();
      record.lastError = error;
      record.runCount += 1;
      record.nextRunAt = computeNextRun(record.schedule, Date.now(), record.timeZone);
    });
    return this.get(id);
  }

  size() {
    return Object.keys(this.store.load().jobs).length;
  }
}
