import { routingKeys, topics } from "@repo/shared";
import { markEventProcessed, nextOutboxInsertValues, withInventoryTransaction } from "../repositories/inventory.repository.js";
import { createEventEnvelope } from "../utils/event.utils.js";

export async function handleInventoryCommand(message: any, payload: any) {
  const eventId = message.message.headers?.eventId?.toString() ?? payload.eventId;
  const routingKey = message.message.headers?.routingKey?.toString() ?? "unknown";
  if (!eventId) {
    throw new Error("Missing eventId on consumed message");
  }

  if (payload.eventType === "ReleaseInventory") {
    await withInventoryTransaction(async (client) => {
      const shouldProcess = await markEventProcessed(client, eventId, message.topic, routingKey);
      if (!shouldProcess) {
        return;
      }

      const reservation = await client.query(
        "SELECT sku, quantity FROM inventory.reservations WHERE order_id = $1 AND status = 'RESERVED'",
        [payload.orderId]
      );
      const existing = reservation.rows[0];
      if (!existing) {
        return;
      }

      await client.query(
        `
          UPDATE inventory.inventory_items
          SET available_quantity = available_quantity + $2,
              reserved_quantity = reserved_quantity - $2,
              updated_at = NOW()
          WHERE sku = $1
        `,
        [existing.sku, existing.quantity]
      );
      await client.query("UPDATE inventory.reservations SET status = 'RELEASED', updated_at = NOW() WHERE order_id = $1", [payload.orderId]);
    });
    return;
  }

  await withInventoryTransaction(async (client) => {
    const shouldProcess = await markEventProcessed(client, eventId, message.topic, routingKey);
    if (!shouldProcess) {
      return;
    }

    const item = await client.query(
      "SELECT available_quantity FROM inventory.inventory_items WHERE sku = $1 FOR UPDATE",
      [payload.itemSku]
    );

    if (!item.rows[0] || item.rows[0].available_quantity < payload.quantity) {
      const rejected = createEventEnvelope(routingKeys.inventoryRejected, {
        eventType: "InventoryRejected",
        orderId: payload.orderId,
        reason: "Insufficient inventory"
      });
      await client.query(
        `
          INSERT INTO inventory.outbox (id, topic, routing_key, payload, headers)
          VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)
        `,
        nextOutboxInsertValues(topics.inventory, rejected.routingKey, rejected.payload, rejected.headers)
      );
      return;
    }

    await client.query(
      `
        UPDATE inventory.inventory_items
        SET available_quantity = available_quantity - $2,
            reserved_quantity = reserved_quantity + $2,
            updated_at = NOW()
        WHERE sku = $1
      `,
      [payload.itemSku, payload.quantity]
    );

    await client.query(
      `
        INSERT INTO inventory.reservations (order_id, sku, quantity, status)
        VALUES ($1, $2, $3, 'RESERVED')
        ON CONFLICT (order_id)
        DO UPDATE SET status = 'RESERVED', updated_at = NOW()
      `,
      [payload.orderId, payload.itemSku, payload.quantity]
    );

    const reserved = createEventEnvelope(routingKeys.inventoryReserved, {
      eventType: "InventoryReserved",
      orderId: payload.orderId,
      totalAmount: payload.totalAmount,
      currency: payload.currency
    });

    await client.query(
      `
        INSERT INTO inventory.outbox (id, topic, routing_key, payload, headers)
        VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)
      `,
      nextOutboxInsertValues(topics.inventory, reserved.routingKey, reserved.payload, reserved.headers)
    );
  });
}
