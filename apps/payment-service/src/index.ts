import { env } from "@repo/config";
import { logger } from "@repo/shared";
import { buildApp } from "./app.js";
import { startPaymentConsumer } from "./consumers/payment.consumer.js";
import { startOutboxPublisher } from "./services/outbox.service.js";

const app = buildApp();

startOutboxPublisher();
await startPaymentConsumer();

app.listen(env.PAYMENT_SERVICE_PORT, "0.0.0.0", () => {
  logger.info({ port: env.PAYMENT_SERVICE_PORT }, "Payment service listening");
});
