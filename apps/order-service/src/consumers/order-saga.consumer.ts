import { consumeTopics } from "@repo/messaging";
import { routingKeys, topics } from "@repo/shared";
import { handleSagaEvent } from "../services/order.service.js";

export async function startOrderSagaConsumer() {
  await consumeTopics({
    groupId: "order-service-saga",
    topics: [topics.inventory, topics.payment],
    routingKeys: [
      routingKeys.inventoryReserved,
      routingKeys.inventoryRejected,
      routingKeys.paymentSucceeded,
      routingKeys.paymentFailed
    ],
    handler: handleSagaEvent
  });
}

