import { routingKeys, topics } from "@repo/shared";
import { markEventProcessed, nextOutboxInsertValues, withPaymentTransaction } from "../repositories/payment.repository.js";
import { createEventEnvelope } from "../utils/event.utils.js";

export async function handlePaymentCommand(message: any, payload: any) {
  const eventId = message.message.headers?.eventId?.toString() ?? payload.eventId;
  const routingKey = message.message.headers?.routingKey?.toString() ?? "unknown";
  if (!eventId) {
    throw new Error("Missing eventId on consumed message");
  }

  await withPaymentTransaction(async (client) => {
    const shouldProcess = await markEventProcessed(client, eventId, message.topic, routingKey);
    if (!shouldProcess) {
      return;
    }

    const approved = Number(payload.amount) <= 10000;
    const paymentResultEvent = createEventEnvelope(
      approved ? routingKeys.paymentSucceeded : routingKeys.paymentFailed,
      {
        eventType: approved ? "PaymentSucceeded" : "PaymentFailed",
        orderId: payload.orderId,
        reason: approved ? undefined : "Payment authorization failed"
      }
    );

    await client.query(
      `
        INSERT INTO payments.payment_attempts (order_id, amount, currency, status)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (order_id)
        DO UPDATE SET status = EXCLUDED.status, updated_at = NOW()
      `,
      [payload.orderId, payload.amount, payload.currency, approved ? "SUCCEEDED" : "FAILED"]
    );

    await client.query(
      `
        INSERT INTO payments.outbox (id, topic, routing_key, payload, headers)
        VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)
      `,
      nextOutboxInsertValues(topics.payment, paymentResultEvent.routingKey, paymentResultEvent.payload, paymentResultEvent.headers)
    );
  });
}

