ALTER TABLE orders.orders
  ALTER COLUMN user_id TYPE TEXT USING user_id::text;

ALTER TABLE orders.orders
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

ALTER TABLE orders.orders
  ADD COLUMN IF NOT EXISTS request_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS orders_orders_user_id_idempotency_key_idx
  ON orders.orders (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS orders.processed_events (
  event_id TEXT PRIMARY KEY,
  topic TEXT NOT NULL,
  routing_key TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory.processed_events (
  event_id TEXT PRIMARY KEY,
  topic TEXT NOT NULL,
  routing_key TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments.processed_events (
  event_id TEXT PRIMARY KEY,
  topic TEXT NOT NULL,
  routing_key TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
