import { publishEvent } from "@repo/messaging";
import { logger } from "@repo/shared";
import { getPendingOutboxBatch, markOutboxPublished } from "../repositories/payment.repository.js";

export async function publishOutboxBatch() {
  const rows = await getPendingOutboxBatch();
  for (const row of rows) {
    await publishEvent(row.topic, row.routing_key, row.payload, row.headers);
    await markOutboxPublished(row.id);
  }
}

export function startOutboxPublisher() {
  setInterval(() => {
    void publishOutboxBatch().catch((error) => logger.error({ err: error }, "payment outbox publish failed"));
  }, 1500);
}

