import { env } from "@repo/config";
import { buildApp } from "./app.js";
import { startOrderSagaConsumer } from "./consumers/order-saga.consumer.js";
import { startOutboxPublisher } from "./services/outbox.service.js";

const app = await buildApp();

startOutboxPublisher();
await startOrderSagaConsumer();

await app.listen({
  port: env.ORDER_SERVICE_PORT,
  host: "0.0.0.0"
});

