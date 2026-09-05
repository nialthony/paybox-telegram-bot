/**
 * Tiny leveled logger with automatic secret redaction.
 * Never logs API keys, signing keys, tokens or card numbers.
 */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 99 };

const SECRET_PATTERNS = [
  /pbx_live_[A-Za-z0-9._-]+/g,
  /pbxk1\.[A-Za-z0-9._-]+/g,
  /sk-[A-Za-z0-9_-]{8,}/g,
  /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g,
  /Bearer\s+[A-Za-z0-9._-]+/gi,
  /"access_token"\s*:\s*"[^"]+"/gi,
  /"refresh_token"\s*:\s*"[^"]+"/gi,
];

export function redact(value) {
  let out = typeof value === 'string' ? value : safeStringify(value);
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, '[REDACTED]');
  }
  return out;
}

function safeStringify(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

class Logger {
  constructor({ level = 'info' } = {}) {
    this.level = LEVELS[level] ?? LEVELS.info;
  }

  log(level, args) {
    if (LEVELS[level] < this.level) return;
    const ts = new Date().toISOString();
    const line = args.map(redact).join(' ');
    const stream = level === 'error' ? process.stderr : process.stdout;
    stream.write(`[${ts}] [${level.toUpperCase()}] ${line}\n`);
  }

  debug(...args) { this.log('debug', args); }
  info(...args) { this.log('info', args); }
  warn(...args) { this.log('warn', args); }
  error(...args) { this.log('error', args); }

  child() { return this; }
}

export function createLogger(config) {
  return new Logger({ level: config?.logLevel || 'info' });
}

export const logger = createLogger();
