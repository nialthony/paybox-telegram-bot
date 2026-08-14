CREATE TABLE IF NOT EXISTS wallet_profiles (
  telegram_user_id TEXT NOT NULL,
  telegram_username TEXT,
  asset TEXT NOT NULL CHECK (asset IN ('ETH', 'SOL')),
  wallet_address TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (telegram_user_id, asset)
);

CREATE UNIQUE INDEX IF NOT EXISTS wallet_profiles_username_asset_idx
  ON wallet_profiles (LOWER(telegram_username), asset)
  WHERE telegram_username IS NOT NULL;

CREATE INDEX IF NOT EXISTS wallet_profiles_user_idx
  ON wallet_profiles (telegram_user_id, asset);
