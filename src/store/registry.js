import { JsonFileStore } from './jsonFile.js';
import { isAnyAddress, isTelegramHandle } from '../utils/validate.js';

/**
 * The address book: maps Telegram @handles to wallet addresses so `/pay
 * @alice` and `/transfer @alice 5 USDC` can resolve recipients without
 * ever touching the chain.
 *
 * Entries are added with `/register` (and learned automatically when a user
 * posts their address in chat).
 */

export class Registry {
  static FORBIDDEN_HANDLES = new Set(['__proto__', 'constructor', 'prototype']);

  constructor({ dir }) {
    this.store = new JsonFileStore({
      dir,
      file: 'registry.json',
      defaults: { users: {} },
    });
  }

  /** users: { usernameLower: { handle, address, addedBy, addedAt, alias } } */
  entries() {
    return this.store.load().users;
  }

  add({ handle, address, addedBy, alias }) {
    const normalized = String(handle).toLowerCase().replace(/^@/, '');
    if (Registry.FORBIDDEN_HANDLES.has(normalized)) {
      throw new Error(`"${handle}" is not allowed as a registry handle.`);
    }
    if (!isTelegramHandle(`@${normalized}`)) {
      throw new Error(`"${handle}" is not a valid Telegram handle.`);
    }
    if (!isAnyAddress(address)) {
      throw new Error(`"${address}" is not a valid wallet address.`);
    }
    this.store.mutate((data) => {
      if (Registry.FORBIDDEN_HANDLES.has(normalized)) {
        throw new Error(`"${handle}" is not allowed as a registry handle.`);
      }
      data.users[normalized] = {
        handle: normalized,
        address,
        addedBy: addedBy ?? null,
        addedAt: new Date().toISOString(),
        alias: alias ?? null,
      };
    });
    return this.byHandle(normalized);
  }

  remove(handle) {
    const normalized = String(handle).toLowerCase().replace(/^@/, '');
    if (Registry.FORBIDDEN_HANDLES.has(normalized)) {
      throw new Error(`"${handle}" is not allowed as a registry handle.`);
    }
    let removed = null;
    this.store.mutate((data) => {
      removed = Object.prototype.hasOwnProperty.call(data.users, normalized) ? data.users[normalized] : null;
      delete data.users[normalized];
    });
    return removed;
  }

  byHandle(handle) {
    const normalized = String(handle).toLowerCase().replace(/^@/, '');
    if (Registry.FORBIDDEN_HANDLES.has(normalized)) return null;
    const users = this.entries();
    return Object.prototype.hasOwnProperty.call(users, normalized) ? users[normalized] : null;
  }

  byAddress(address) {
    const entries = Object.values(this.entries());
    return entries.find((e) => e.address.toLowerCase() === String(address).toLowerCase()) ?? null;
  }

  list() {
    return Object.values(this.entries());
  }

  size() {
    return Object.keys(this.entries()).length;
  }
}
