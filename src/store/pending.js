import { JsonFileStore } from './jsonFile.js';
import { logger } from '../logger.js';

/**
 * Durable record of in-flight money requests (transfers, …).
 *
 * When an operation is waiting on a passkey approval the record lives here,
 * so a crash or restart can pick the request back up instead of orphaning a
 * payment mid-flight. Records are removed the moment the request reaches a
 * terminal state (and, for transfers, after the broadcast has been handed to
 * the on-chain confirmation watcher).
 *
 * The store deliberately persists everything needed to *finish* the flow
 * after a restart: the Paybox request id, the unsigned sign intent, the
 * chain and transfer details, and the Telegram message that has been
 * live-editing the status (so the resumed flow keeps editing the same
 * message the user already has on screen).
 */
export class PendingStore {
  constructor({ dir }) {
    this.store = new JsonFileStore({
      dir,
      file: 'pending.json',
      defaults: { requests: {} },
    });
  }

  /**
   * Persist an in-flight request. Keyed by Paybox request id.
   * record: { requestId, kind, chatId, messageId, …flow-specific meta }
   */
  track(record) {
    if (!record?.requestId) {
      throw new Error('pending.track requires a requestId');
    }
    this.store.mutate((data) => {
      data.requests[record.requestId] = {
        kind: 'transfer',
        createdAt: new Date().toISOString(),
        ...record,
      };
    });
    return this.get(record.requestId);
  }

  get(requestId) {
    return this.store.load().requests[requestId] ?? null;
  }

  list() {
    return Object.values(this.store.load().requests);
  }

  untrack(requestId) {
    let removed = null;
    this.store.mutate((data) => {
      removed = data.requests[requestId] ?? null;
      delete data.requests[requestId];
    });
    return removed;
  }

  /** Drop records older than maxAgeMs; returns the removed records. */
  prune(maxAgeMs) {
    const cutoff = Date.now() - maxAgeMs;
    const removed = [];
    this.store.mutate((data) => {
      for (const [id, record] of Object.entries(data.requests)) {
        const created = Date.parse(record.createdAt);
        if (Number.isFinite(created) && created < cutoff) {
          removed.push(record);
          delete data.requests[id];
        }
      }
    });
    if (removed.length > 0) {
      logger.info(`pending: pruned ${removed.length} stale record(s)`);
    }
    return removed;
  }

  size() {
    return Object.keys(this.store.load().requests).length;
  }
}
