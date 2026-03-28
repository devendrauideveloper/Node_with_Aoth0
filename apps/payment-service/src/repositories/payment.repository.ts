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
      FROM payments.outbox
      WHERE published_at IS NULL
      ORDER BY created_at
      LIMIT 25
    `
  );
  return result.rows;
}

export async function markOutboxPublished(id: string) {
  await pool.query("UPDATE payments.outbox SET published_at = NOW() WHERE id = $1", [id]);
}

export async function withPaymentTransaction<T>(callback: (client: any) => Promise<T>) {
  return withTransaction(callback);
}

export async function markEventProcessed(client: any, eventId: string, topic: string, routingKey: string): Promise<boolean> {
  const result = await client.query(
    `
      INSERT INTO payments.processed_events (event_id, topic, routing_key)
      VALUES ($1, $2, $3)
      ON CONFLICT (event_id) DO NOTHING
    `,
    [eventId, topic, routingKey]
  );
  return result.rowCount === 1;
}

export function nextOutboxInsertValues(topic: string, routingKey: string, payload: Record<string, unknown>, headers: Record<string, unknown>) {
  return [crypto.randomUUID(), topic, routingKey, JSON.stringify(payload), JSON.stringify(headers)];
}

