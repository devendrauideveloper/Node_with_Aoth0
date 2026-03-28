import { env } from "@repo/config";
import { buildApp } from "./app.js";
import { startInventoryConsumer } from "./consumers/inventory.consumer.js";
import { startOutboxPublisher } from "./services/outbox.service.js";

const app = await buildApp();

startOutboxPublisher();
await startInventoryConsumer();

await app.listen({
  port: env.INVENTORY_SERVICE_PORT,
  host: "0.0.0.0"
});

