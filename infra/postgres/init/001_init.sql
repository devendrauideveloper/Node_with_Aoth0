CREATE SCHEMA IF NOT EXISTS identity;
CREATE SCHEMA IF NOT EXISTS orders;
CREATE SCHEMA IF NOT EXISTS inventory;
CREATE SCHEMA IF NOT EXISTS payments;

CREATE TABLE IF NOT EXISTS identity.users (
  id UUID PRIMARY KEY,
  auth0_sub TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS identity.groups (
  id UUID PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS identity.privileges (
  id UUID PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS identity.group_privileges (
  group_id UUID NOT NULL REFERENCES identity.groups(id) ON DELETE CASCADE,
  privilege_id UUID NOT NULL REFERENCES identity.privileges(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, privilege_id)
);

CREATE TABLE IF NOT EXISTS identity.user_group (
  user_id UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES identity.groups(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, group_id)
);

CREATE TABLE IF NOT EXISTS identity.sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  refresh_token_ciphertext TEXT NOT NULL,
  refresh_token_expires_at TIMESTAMPTZ,
  access_token TEXT NOT NULL,
  access_token_expires_at TIMESTAMPTZ NOT NULL,
  id_token TEXT,
  csrf_token TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS orders.orders (
  id UUID PRIMARY KEY,
  user_id TEXT NOT NULL,
  idempotency_key TEXT,
  request_hash TEXT,
  status TEXT NOT NULL,
  total_amount NUMERIC(12,2) NOT NULL,
  currency TEXT NOT NULL,
  item_sku TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS orders_orders_user_id_idempotency_key_idx
  ON orders.orders (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS orders.outbox (
  id UUID PRIMARY KEY,
  topic TEXT NOT NULL,
  routing_key TEXT NOT NULL,
  payload JSONB NOT NULL,
  headers JSONB NOT NULL DEFAULT '{}'::jsonb,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders.processed_events (
  event_id TEXT PRIMARY KEY,
  topic TEXT NOT NULL,
  routing_key TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory.inventory_items (
  sku TEXT PRIMARY KEY,
  available_quantity INTEGER NOT NULL,
  reserved_quantity INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory.reservations (
  order_id UUID PRIMARY KEY,
  sku TEXT NOT NULL REFERENCES inventory.inventory_items(sku),
  quantity INTEGER NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory.outbox (
  id UUID PRIMARY KEY,
  topic TEXT NOT NULL,
  routing_key TEXT NOT NULL,
  payload JSONB NOT NULL,
  headers JSONB NOT NULL DEFAULT '{}'::jsonb,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory.processed_events (
  event_id TEXT PRIMARY KEY,
  topic TEXT NOT NULL,
  routing_key TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments.payment_attempts (
  order_id UUID PRIMARY KEY,
  amount NUMERIC(12,2) NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments.outbox (
  id UUID PRIMARY KEY,
  topic TEXT NOT NULL,
  routing_key TEXT NOT NULL,
  payload JSONB NOT NULL,
  headers JSONB NOT NULL DEFAULT '{}'::jsonb,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments.processed_events (
  event_id TEXT PRIMARY KEY,
  topic TEXT NOT NULL,
  routing_key TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO identity.groups (id, code, name)
VALUES
  ('00000000-0000-0000-0000-000000000101', 'ADMIN', 'Administrators'),
  ('00000000-0000-0000-0000-000000000102', 'MANAGER', 'Managers'),
  ('00000000-0000-0000-0000-000000000103', 'USER', 'Users')
ON CONFLICT (code) DO NOTHING;

INSERT INTO identity.privileges (id, code, description)
VALUES
  ('00000000-0000-0000-0000-000000000201', 'READ', 'Read reports and protected resources'),
  ('00000000-0000-0000-0000-000000000202', 'MODIFY', 'Create and update protected resources'),
  ('00000000-0000-0000-0000-000000000203', 'DELETE', 'Delete protected resources'),
  ('00000000-0000-0000-0000-000000000204', 'ORDER_CREATE', 'Create customer orders')
ON CONFLICT (code) DO NOTHING;

INSERT INTO identity.group_privileges (group_id, privilege_id)
VALUES
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000201'),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000202'),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000203'),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000204'),
  ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000201'),
  ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000202'),
  ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000204'),
  ('00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000201'),
  ('00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000204')
ON CONFLICT DO NOTHING;

INSERT INTO inventory.inventory_items (sku, available_quantity, reserved_quantity)
VALUES
  ('SKU-CHAIR-001', 25, 0),
  ('SKU-DESK-001', 10, 0),
  ('SKU-LIGHT-001', 40, 0)
ON CONFLICT (sku) DO NOTHING;
