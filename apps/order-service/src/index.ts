import { env } from "@repo/config";
import { logger } from "@repo/shared";
import { buildApp } from "./app.js";
import { startOrderSagaConsumer } from "./consumers/order-saga.consumer.js";
import { startOutboxPublisher } from "./services/outbox.service.js";

const app = buildApp();

startOutboxPublisher();
await startOrderSagaConsumer();

app.listen(env.ORDER_SERVICE_PORT, "0.0.0.0", () => {
  logger.info({ port: env.ORDER_SERVICE_PORT }, "Order service listening");
});
