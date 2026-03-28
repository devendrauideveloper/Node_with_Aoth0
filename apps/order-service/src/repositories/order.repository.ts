import crypto from "node:crypto";
import { pool, withTransaction } from "@repo/database";

export async function getPendingOutboxBatch() {
  const result = await pool.query<{
    id: string;
    topic: string;
    routing_key: string;
    payload: Record<string, unknown>;
    headers: Record<string, unknown>;
  }>(
    `
      SELECT id, topic, routing_key, payload, headers
      FROM orders.outbox
      WHERE published_at IS NULL
      ORDER BY created_at
      LIMIT 25
    `
  );
  return result.rows;
}

export async function markOutboxPublished(id: string) {
  await pool.query("UPDATE orders.outbox SET published_at = NOW() WHERE id = $1", [id]);
}

export async function findOrderByIdempotency(userId: string, idempotencyKey: string) {
  const result = await pool.query<{ id: string; status: string; request_hash: string | null }>(
    `
      SELECT id, status, request_hash
      FROM orders.orders
      WHERE user_id = $1 AND idempotency_key = $2
    `,
    [userId, idempotencyKey]
  );
  return result.rows[0] ?? null;
}

export async function createOrderWithOutbox(input: {
  orderId: string;
  userId: string;
  idempotencyKey: string;
  requestHash: string;
  totalAmount: number;
  currency: string;
  itemSku: string;
  quantity: number;
  eventTopic: string;
  eventRoutingKey: string;
  payload: Record<string, unknown>;
  headers: Record<string, unknown>;
}) {
  await withTransaction(async (client) => {
    await client.query(
      `
        INSERT INTO orders.orders (id, user_id, idempotency_key, request_hash, status, total_amount, currency, item_sku, quantity)
        VALUES ($1, $2, $3, $4, 'PENDING_INVENTORY', $5, $6, $7, $8)
      `,
      [
        input.orderId,
        input.userId,
        input.idempotencyKey,
        input.requestHash,
        input.totalAmount,
        input.currency,
        input.itemSku,
        input.quantity
      ]
    );

    await client.query(
      `
        INSERT INTO orders.outbox (id, topic, routing_key, payload, headers)
        VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)
      `,
      [crypto.randomUUID(), input.eventTopic, input.eventRoutingKey, JSON.stringify(input.payload), JSON.stringify(input.headers)]
    );
  });
}

export async function listOrders(limit: number) {
  const result = await pool.query(
    `
      SELECT id, user_id, status, total_amount, currency, item_sku, quantity, failure_reason, created_at, updated_at
      FROM orders.orders
      ORDER BY created_at DESC
      LIMIT $1
    `,
    [limit]
  );
  return result.rows;
}

export async function markEventProcessed(client: any, eventId: string, topic: string, routingKey: string): Promise<boolean> {
  const result = await client.query(
    `
      INSERT INTO orders.processed_events (event_id, topic, routing_key)
      VALUES ($1, $2, $3)
      ON CONFLICT (event_id) DO NOTHING
    `,
    [eventId, topic, routingKey]
  );
  return result.rowCount === 1;
}

export async function withOrderTransaction<T>(callback: (client: any) => Promise<T>) {
  return withTransaction(callback);
}

