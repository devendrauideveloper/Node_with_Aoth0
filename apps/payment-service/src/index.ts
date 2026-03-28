import { env } from "@repo/config";
import { buildApp } from "./app.js";
import { startPaymentConsumer } from "./consumers/payment.consumer.js";
import { startOutboxPublisher } from "./services/outbox.service.js";

const app = await buildApp();

startOutboxPublisher();
await startPaymentConsumer();

await app.listen({
  port: env.PAYMENT_SERVICE_PORT,
  host: "0.0.0.0"
});
