import { consumeTopics } from "@repo/messaging";
import { routingKeys, topics } from "@repo/shared";
import { handlePaymentCommand } from "../services/payment.service.js";

export async function startPaymentConsumer() {
  await consumeTopics({
    groupId: "payment-service-commands",
    topics: [topics.payment],
    routingKeys: [routingKeys.processPayment],
    handler: handlePaymentCommand
  });
}

