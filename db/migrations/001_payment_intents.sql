CREATE TABLE IF NOT EXISTS payment_intents (
  id UUID PRIMARY KEY,
  telegram_user_id TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  draft JSONB NOT NULL,
  state TEXT NOT NULL CHECK (state IN (
    'awaiting_confirmation',
    'creating',
    'pending_approval',
    'succeeded',
    'failed',
    'expired',
    'cancelled'
  )),
  idempotency_key TEXT NOT NULL UNIQUE,
  provider_request_id TEXT UNIQUE,
  provider_status TEXT,
  last_error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS payment_intents_owned_active_idx
  ON payment_intents (telegram_user_id, chat_id, state, expires_at);

CREATE INDEX IF NOT EXISTS payment_intents_reconciliation_idx
  ON payment_intents (state, updated_at)
  WHERE state = 'pending_approval' AND provider_request_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS payment_intent_events (
  event_id BIGSERIAL PRIMARY KEY,
  intent_id UUID NOT NULL REFERENCES payment_intents(id) ON DELETE CASCADE,
  from_state TEXT,
  to_state TEXT NOT NULL,
  provider_status TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS payment_intent_events_intent_idx
  ON payment_intent_events (intent_id, created_at);
