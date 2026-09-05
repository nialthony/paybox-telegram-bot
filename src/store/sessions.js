import { logger } from '../logger.js';

/**
 * In-memory session store with TTL + idle cleanup.
 *
 * Holds per-user conversational state (agent history, pending UI state).
 * Deliberately ephemeral: nothing financial is persisted here — durable data
 * lives in the registry/stats JSON stores.
 */

const TTL_MS = 30 * 60 * 1000; // idle lifetime
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

export class SessionStore {
  constructor({ ttlMs = TTL_MS } = {}) {
    this.ttlMs = ttlMs;
    this.sessions = new Map();
    this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS);
    if (this.cleanupTimer.unref) this.cleanupTimer.unref();
  }

  get(userId) {
    const session = this.sessions.get(userId);
    if (!session) return null;
    session.lastSeen = Date.now();
    return session;
  }

  /** Get-or-create a session for a user. */
  obtain(userId, defaults = {}) {
    let session = this.get(userId);
    if (!session) {
      session = { userId, createdAt: Date.now(), lastSeen: Date.now(), ...defaults };
      this.sessions.set(userId, session);
    }
    return session;
  }

  update(userId, patch) {
    const session = this.obtain(userId);
    Object.assign(session, patch, { lastSeen: Date.now() });
    return session;
  }

  delete(userId) {
    this.sessions.delete(userId);
  }

  cleanup() {
    const now = Date.now();
    let removed = 0;
    for (const [userId, session] of this.sessions) {
      if (now - session.lastSeen > this.ttlMs) {
        this.sessions.delete(userId);
        removed += 1;
      }
    }
    if (removed > 0) logger.debug(`sessions: evicted ${removed} idle session(s)`);
    return removed;
  }

  size() {
    return this.sessions.size;
  }

  stop() {
    clearInterval(this.cleanupTimer);
  }
}

export function appendHistory(session, role, content, max = 12) {
  if (!Array.isArray(session.agentHistory)) session.agentHistory = [];
  session.agentHistory.push({ role, content });
  if (session.agentHistory.length > max) {
    session.agentHistory = session.agentHistory.slice(-max);
  }
  return session.agentHistory;
}
