import { env } from "@repo/config";
import { logger } from "@repo/shared";
import { buildApp } from "./app.js";

const app = buildApp();

app.listen(env.API_GATEWAY_PORT, "0.0.0.0", () => {
  logger.info({ port: env.API_GATEWAY_PORT }, "API Gateway listening");
});
