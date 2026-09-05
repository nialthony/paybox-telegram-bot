import { JsonFileStore } from './jsonFile.js';

/**
 * Lightweight usage counters, persisted to `data/stats.json`.
 * Used by /stats and for operational visibility. No personal data is stored.
 */
export class Stats {
  constructor({ dir }) {
    this.store = new JsonFileStore({
      dir,
      file: 'stats.json',
      defaults: { commands: {}, startedAt: null },
    });
    const data = this.store.load();
    if (!data.startedAt) {
      data.startedAt = new Date().toISOString();
      this.store.save();
    }
  }

  hit(command) {
    this.store.mutate((data) => {
      data.commands[command] = (data.commands[command] ?? 0) + 1;
    });
  }

  snapshot() {
    const data = this.store.load();
    return {
      startedAt: data.startedAt,
      commands: { ...data.commands },
      total: Object.values(data.commands).reduce((a, b) => a + b, 0),
    };
  }
}
