import { randomUUID } from 'node:crypto';

const TERMINAL_STATES = new Set(['cancelled', 'expired', 'failed', 'succeeded']);

export class PaymentIntentError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PaymentIntentError';
  }
}

export class PaymentIntentStore {
  constructor({ ttlMs = 15 * 60 * 1000, now = () => Date.now() } = {}) {
    this.ttlMs = ttlMs;
    this.now = now;
    this.intents = new Map();
    this.walletProfiles = new Map();
  }

  async checkHealth() {
    return true;
  }

  registerWalletProfile({ telegramUserId, telegramUsername, asset, walletAddress }) {
    const userKey = `${String(telegramUserId)}:${asset}`;
    const previous = this.walletProfiles.get(userKey);
    if (previous?.telegramUsername) {
      this.walletProfiles.delete(`@${previous.telegramUsername.toLowerCase()}:${asset}`);
    }
    const profile = Object.freeze({
      telegramUserId: String(telegramUserId),
      telegramUsername: telegramUsername || null,
      asset,
      walletAddress,
    });
    this.walletProfiles.set(userKey, profile);
    if (profile.telegramUsername) {
      this.walletProfiles.set(`@${profile.telegramUsername.toLowerCase()}:${asset}`, profile);
    }
    return profile;
  }

  getWalletProfile({ telegramUserId, telegramUsername, asset }) {
    return this.walletProfiles.get(`${String(telegramUserId || '')}:${asset}`)
      || (telegramUsername
        ? this.walletProfiles.get(`@${String(telegramUsername).replace(/^@/, '').toLowerCase()}:${asset}`)
        : null)
      || null;
  }

  createDraft({ telegramUserId, chatId, draft }) {
    if (!telegramUserId || !chatId || !draft) {
      throw new PaymentIntentError('Payment intent requires a Telegram user, chat, and validated draft.');
    }

    const createdAt = this.now();
    const intent = Object.freeze({
      id: randomUUID(),
      telegramUserId: String(telegramUserId),
      chatId: String(chatId),
      draft,
      state: 'awaiting_confirmation',
      createdAt,
      expiresAt: createdAt + this.ttlMs,
      providerRequestId: null,
    });

    this.intents.set(intent.id, intent);
    return intent;
  }

  getOwnedActiveIntent({ id, telegramUserId, chatId }) {
    const intent = this.intents.get(id);
    if (!intent) throw new PaymentIntentError('This payment request was not found.');
    if (intent.telegramUserId !== String(telegramUserId) || intent.chatId !== String(chatId)) {
      throw new PaymentIntentError('This payment request does not belong to you.');
    }
    if (this.now() >= intent.expiresAt) {
      this.transition(intent.id, 'expired');
      throw new PaymentIntentError('This payment request has expired.');
    }
    if (TERMINAL_STATES.has(intent.state)) {
      throw new PaymentIntentError(`This payment request is already ${intent.state}.`);
    }
    return intent;
  }

  transition(id, state, patch = {}) {
    const current = this.intents.get(id);
    if (!current) throw new PaymentIntentError('This payment request was not found.');

    const next = Object.freeze({ ...current, ...patch, state, updatedAt: this.now() });
    this.intents.set(id, next);
    return next;
  }

  claimForCreation({ id, telegramUserId, chatId }) {
    const intent = this.getOwnedActiveIntent({ id, telegramUserId, chatId });
    if (intent.state !== 'awaiting_confirmation') {
      throw new PaymentIntentError('This payment request has already been processed.');
    }
    return this.transition(intent.id, 'creating');
  }

  cancel({ id, telegramUserId, chatId }) {
    const intent = this.getOwnedActiveIntent({ id, telegramUserId, chatId });
    if (intent.state !== 'awaiting_confirmation') {
      throw new PaymentIntentError('This payment request can no longer be cancelled.');
    }
    return this.transition(intent.id, 'cancelled');
  }

  expireStaleIntents() {
    const expired = [];
    for (const intent of this.intents.values()) {
      if (!TERMINAL_STATES.has(intent.state) && this.now() >= intent.expiresAt) {
        expired.push(this.transition(intent.id, 'expired'));
      }
    }
    return expired;
  }
}
