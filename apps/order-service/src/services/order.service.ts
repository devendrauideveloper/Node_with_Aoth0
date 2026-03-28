import crypto from "node:crypto";
import { routingKeys, topics } from "@repo/shared";
import { createOrderWithOutbox, findOrderByIdempotency, listOrders, markEventProcessed, withOrderTransaction } from "../repositories/order.repository.js";
import { createEventEnvelope, requestHash } from "../utils/event.utils.js";

export async function createOrder(input: {
  body: { itemSku: string; quantity: number; totalAmount: number; currency: string };
  userSub: string;
  idempotencyKey: string;
  correlationId: string;
}) {
  const orderId = crypto.randomUUID();
  const normalizedCurrency = input.body.currency.toUpperCase();
  const bodyHash = requestHash({ ...input.body, currency: normalizedCurrency });

  const existing = await findOrderByIdempotency(input.userSub, input.idempotencyKey);
  if (existing) {
    if (existing.request_hash && existing.request_hash !== bodyHash) {
      return {
        type: "conflict" as const,
        payload: { message: "Idempotency-Key reuse with different request payload is not allowed" }
      };
    }

    return {
      type: "replayed" as const,
      payload: {
        orderId: existing.id,
        status: existing.status,
        replayed: true
      }
    };
  }

  const reserveInventoryEvent = createEventEnvelope(routingKeys.reserveInventory, {
    eventType: "ReserveInventoryRequested",
    orderId,
    userId: input.userSub,
    itemSku: input.body.itemSku,
    quantity: input.body.quantity,
    totalAmount: input.body.totalAmount,
    currency: normalizedCurrency
  }, input.correlationId);

  await createOrderWithOutbox({
    orderId,
    userId: input.userSub,
    idempotencyKey: input.idempotencyKey,
    requestHash: bodyHash,
    totalAmount: input.body.totalAmount,
    currency: normalizedCurrency,
    itemSku: input.body.itemSku,
    quantity: input.body.quantity,
    eventTopic: topics.inventory,
    eventRoutingKey: reserveInventoryEvent.routingKey,
    payload: reserveInventoryEvent.payload,
    headers: reserveInventoryEvent.headers
  });

  return {
    type: "created" as const,
    payload: { orderId, status: "PENDING_INVENTORY" }
  };
}

export async function getOrders(limit: number) {
  return { items: await listOrders(limit) };
}

export async function handleSagaEvent(message: any, payload: any) {
  const eventId = message.message.headers?.eventId?.toString() ?? payload.eventId;
  const routingKey = message.message.headers?.routingKey?.toString() ?? "unknown";
  const correlationId = message.message.headers?.correlationId?.toString();
  if (!eventId) {
    throw new Error("Missing eventId on consumed message");
  }

  if (payload.eventType === "InventoryReserved") {
    await withOrderTransaction(async (client) => {
      const shouldProcess = await markEventProcessed(client, eventId, message.topic, routingKey);
      if (!shouldProcess) {
        return;
      }

      const processPaymentEvent = createEventEnvelope(routingKeys.processPayment, {
        eventType: "ProcessPayment",
        orderId: payload.orderId,
        amount: payload.totalAmount,
        currency: payload.currency
      }, correlationId);

      await client.query("UPDATE orders.orders SET status = 'PENDING_PAYMENT', updated_at = NOW() WHERE id = $1", [payload.orderId]);
      await client.query(
        `
          INSERT INTO orders.outbox (id, topic, routing_key, payload, headers)
          VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)
        `,
        [crypto.randomUUID(), topics.payment, processPaymentEvent.routingKey, JSON.stringify(processPaymentEvent.payload), JSON.stringify(processPaymentEvent.headers)]
      );
    });
  }

  if (payload.eventType === "InventoryRejected") {
    await withOrderTransaction(async (client) => {
      const shouldProcess = await markEventProcessed(client, eventId, message.topic, routingKey);
      if (!shouldProcess) {
        return;
      }
      await client.query("UPDATE orders.orders SET status = 'FAILED', failure_reason = $2, updated_at = NOW() WHERE id = $1", [payload.orderId, payload.reason]);
    });
  }

  if (payload.eventType === "PaymentSucceeded") {
    await withOrderTransaction(async (client) => {
      const shouldProcess = await markEventProcessed(client, eventId, message.topic, routingKey);
      if (!shouldProcess) {
        return;
      }
      await client.query("UPDATE orders.orders SET status = 'CONFIRMED', updated_at = NOW() WHERE id = $1", [payload.orderId]);
    });
  }

  if (payload.eventType === "PaymentFailed") {
    await withOrderTransaction(async (client) => {
      const shouldProcess = await markEventProcessed(client, eventId, message.topic, routingKey);
      if (!shouldProcess) {
        return;
      }

      const releaseInventoryEvent = createEventEnvelope(routingKeys.releaseInventory, {
        eventType: "ReleaseInventory",
        orderId: payload.orderId
      }, correlationId);

      await client.query("UPDATE orders.orders SET status = 'FAILED', failure_reason = $2, updated_at = NOW() WHERE id = $1", [payload.orderId, payload.reason]);
      await client.query(
        `
          INSERT INTO orders.outbox (id, topic, routing_key, payload, headers)
          VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)
        `,
        [crypto.randomUUID(), topics.inventory, releaseInventoryEvent.routingKey, JSON.stringify(releaseInventoryEvent.payload), JSON.stringify(releaseInventoryEvent.headers)]
      );
    });
  }
}

