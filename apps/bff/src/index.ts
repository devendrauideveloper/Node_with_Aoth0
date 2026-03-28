import { env } from "@repo/config";
import { logger } from "@repo/shared";
import { buildApp } from "./app.js";

const app = buildApp();

app.listen(env.BFF_PORT, "0.0.0.0", () => {
  logger.info({ port: env.BFF_PORT }, "BFF listening");
});
