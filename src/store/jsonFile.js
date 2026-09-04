import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../logger.js';

/**
 * Minimal crash-safe JSON file store.
 *
 * Writes go to a temp file and are atomically renamed into place, so a crash
 * mid-write can never corrupt the store. Reads tolerate a missing file.
 */
export class JsonFileStore {
  constructor({ dir, file, defaults }) {
    this.filePath = path.join(dir, file);
    this.defaults = defaults ?? {};
    this.data = null;
  }

  load() {
    if (this.data !== null) return this.data;
    try {
      this.data = { ...this.defaults, ...JSON.parse(fs.readFileSync(this.filePath, 'utf8')) };
    } catch (error) {
      if (error.code !== 'ENOENT') {
        logger.warn(`could not read ${this.filePath}, starting fresh: ${error.message}`);
      }
      this.data = { ...this.defaults };
    }
    return this.data;
  }

  save() {
    const tmp = `${this.filePath}.${process.pid}.tmp`;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
    fs.renameSync(tmp, this.filePath);
  }

  /** Read-modify-write helper that serializes concurrent edits per process. */
  mutate(fn) {
    this.load();
    fn(this.data);
    this.save();
    return this.data;
  }
}
