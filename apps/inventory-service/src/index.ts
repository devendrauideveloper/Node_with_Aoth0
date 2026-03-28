import { env } from "@repo/config";
import { logger } from "@repo/shared";
import { buildApp } from "./app.js";
import { startInventoryConsumer } from "./consumers/inventory.consumer.js";
import { startOutboxPublisher } from "./services/outbox.service.js";

const app = buildApp();

startOutboxPublisher();
await startInventoryConsumer();

app.listen(env.INVENTORY_SERVICE_PORT, "0.0.0.0", () => {
  logger.info({ port: env.INVENTORY_SERVICE_PORT }, "Inventory service listening");
});
