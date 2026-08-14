import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PaymentIntentError } from './payment-intents.js';

const { Pool } = pg;
const MIGRATION_SQL = readFileSync(new URL('../../db/migrations/001_payment_intents.sql', import.meta.url), 'utf8');
const TERMINAL_STATES = new Set(['cancelled', 'expired', 'failed', 'succeeded']);
const ALLOWED_TRANSITIONS = new Map([
  ['awaiting_confirmation', new Set(['creating', 'expired', 'cancelled'])],
  ['creating', new Set(['pending_approval', 'succeeded', 'failed'])],
  ['pending_approval', new Set(['pending_approval', 'succeeded', 'failed'])],
  ['succeeded', new Set()],
  ['failed', new Set()],
  ['expired', new Set()],
  ['cancelled', new Set()],
]);

function asTimestamp(value) {
  return new Date(value).getTime();
}

function rowToIntent(row) {
  return Object.freeze({
    id: row.id,
    telegramUserId: String(row.telegram_user_id),
    chatId: String(row.chat_id),
    draft: row.draft,
    state: row.state,
    idempotencyKey: row.idempotency_key,
    providerRequestId: row.provider_request_id,
    providerStatus: row.provider_status,
    lastErrorCode: row.last_error_code,
    createdAt: asTimestamp(row.created_at),
    expiresAt: asTimestamp(row.expires_at),
    updatedAt: asTimestamp(row.updated_at),
  });
}

function patchValues(patch) {
  return {
    providerRequestId: patch.providerRequestId ?? null,
    providerStatus: patch.providerStatus ?? null,
    lastErrorCode: patch.lastErrorCode ?? null,
  };
}

export class PostgresPaymentIntentStore {
  constructor({ pool, ttlMs = 15 * 60 * 1000, now = () => Date.now() } = {}) {
    if (!pool) throw new Error('PostgresPaymentIntentStore requires a pg Pool.');
    this.pool = pool;
    this.ttlMs = ttlMs;
    this.now = now;
  }

  static fromConnectionString({ connectionString, ttlMs, now, ...poolOptions } = {}) {
    if (!connectionString) throw new Error('DATABASE_URL is required for persistent payment intents.');
    return new PostgresPaymentIntentStore({
      pool: new Pool({ connectionString, ...poolOptions }),
      ttlMs,
      now,
    });
  }

  async initialize() {
    await this.pool.query(MIGRATION_SQL);
  }

  async close() {
    await this.pool.end();
  }

  async createDraft({ telegramUserId, chatId, draft, idempotencyKey = randomUUID() }) {
    if (!telegramUserId || !chatId || !draft) {
      throw new PaymentIntentError('Payment intent requires a Telegram user, chat, and validated draft.');
    }

    const id = randomUUID();
    const createdAt = new Date(this.now());
    const expiresAt = new Date(this.now() + this.ttlMs);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `INSERT INTO payment_intents
          (id, telegram_user_id, chat_id, draft, state, idempotency_key, created_at, expires_at, updated_at)
         VALUES ($1, $2, $3, $4::jsonb, 'awaiting_confirmation', $5, $6, $7, $6)
         ON CONFLICT (idempotency_key) DO UPDATE SET idempotency_key = EXCLUDED.idempotency_key
         RETURNING *`,
        [id, String(telegramUserId), String(chatId), JSON.stringify(draft), idempotencyKey, createdAt, expiresAt],
      );
      const intent = rowToIntent(result.rows[0]);
      await client.query(
        `INSERT INTO payment_intent_events (intent_id, to_state, metadata)
         VALUES ($1, $2, $3::jsonb)`,
        [intent.id, intent.state, JSON.stringify({ idempotencyKey })],
      );
      await client.query('COMMIT');
      return intent;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getOwnedActiveIntent({ id, telegramUserId, chatId }) {
    const result = await this.pool.query(
      `SELECT * FROM payment_intents
       WHERE id = $1 AND telegram_user_id = $2 AND chat_id = $3`,
      [id, String(telegramUserId), String(chatId)],
    );
    const row = result.rows[0];
    if (!row) {
      const ownership = await this.pool.query('SELECT id FROM payment_intents WHERE id = $1', [id]);
      throw new PaymentIntentError(ownership.rowCount ? 'This payment request does not belong to you.' : 'This payment request was not found.');
    }

    const intent = rowToIntent(row);
    if (this.now() >= intent.expiresAt && !TERMINAL_STATES.has(intent.state)) {
      await this.transition(intent.id, 'expired');
      throw new PaymentIntentError('This payment request has expired.');
    }
    if (TERMINAL_STATES.has(intent.state)) {
      throw new PaymentIntentError(`This payment request is already ${intent.state}.`);
    }
    return intent;
  }

  async claimForCreation({ id, telegramUserId, chatId }) {
    const now = new Date(this.now());
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `UPDATE payment_intents
         SET state = 'creating', updated_at = $4
         WHERE id = $1 AND telegram_user_id = $2 AND chat_id = $3
           AND state = 'awaiting_confirmation' AND expires_at > $4
         RETURNING *`,
        [id, String(telegramUserId), String(chatId), now],
      );
      if (!result.rowCount) {
        await client.query('ROLLBACK');
        await this.getOwnedActiveIntent({ id, telegramUserId, chatId });
        throw new PaymentIntentError('This payment request has already been processed.');
      }
      const intent = rowToIntent(result.rows[0]);
      await client.query(
        `INSERT INTO payment_intent_events (intent_id, from_state, to_state)
         VALUES ($1, 'awaiting_confirmation', 'creating')`,
        [id],
      );
      await client.query('COMMIT');
      return intent;
    } catch (error) {
      if (!['This payment request has already been processed.', 'This payment request has expired.'].includes(error.message)) {
        try { await client.query('ROLLBACK'); } catch {}
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async transition(id, state, patch = {}) {
    const values = patchValues(patch);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const currentResult = await client.query('SELECT * FROM payment_intents WHERE id = $1 FOR UPDATE', [id]);
      const currentRow = currentResult.rows[0];
      if (!currentRow) throw new PaymentIntentError('This payment request was not found.');
      if (currentRow.state !== state && !ALLOWED_TRANSITIONS.get(currentRow.state)?.has(state)) {
        throw new PaymentIntentError(`Cannot move payment request from ${currentRow.state} to ${state}.`);
      }
      const nextResult = await client.query(
        `UPDATE payment_intents
         SET state = $2, provider_request_id = COALESCE($3, provider_request_id),
             provider_status = COALESCE($4, provider_status), last_error_code = COALESCE($5, last_error_code),
             updated_at = $6
         WHERE id = $1
         RETURNING *`,
        [id, state, values.providerRequestId, values.providerStatus, values.lastErrorCode, new Date(this.now())],
      );
      const intent = rowToIntent(nextResult.rows[0]);
      await client.query(
        `INSERT INTO payment_intent_events
          (intent_id, from_state, to_state, provider_status, metadata)
         VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [id, currentRow.state, state, values.providerStatus, JSON.stringify({ lastErrorCode: values.lastErrorCode })],
      );
      await client.query('COMMIT');
      return intent;
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      throw error;
    } finally {
      client.release();
    }
  }

  async cancel({ id, telegramUserId, chatId }) {
    const current = await this.getOwnedActiveIntent({ id, telegramUserId, chatId });
    if (current.state !== 'awaiting_confirmation') {
      throw new PaymentIntentError('This payment request can no longer be cancelled.');
    }
    return this.transition(id, 'cancelled');
  }

  async expireStaleIntents() {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `UPDATE payment_intents
         SET state = 'expired', updated_at = NOW()
         WHERE state = 'awaiting_confirmation' AND expires_at <= NOW()
         RETURNING *`,
      );
      for (const row of result.rows) {
        await client.query(
          `INSERT INTO payment_intent_events (intent_id, from_state, to_state)
           VALUES ($1, 'awaiting_confirmation', 'expired')`,
          [row.id],
        );
      }
      await client.query('COMMIT');
      return result.rows.map(rowToIntent);
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      throw error;
    } finally {
      client.release();
    }
  }

  async listPendingReconciliation({ limit = 50 } = {}) {
    const result = await this.pool.query(
      `SELECT * FROM payment_intents
       WHERE state = 'pending_approval' AND provider_request_id IS NOT NULL
       ORDER BY updated_at ASC LIMIT $1`,
      [limit],
    );
    return result.rows.map(rowToIntent);
  }
}
