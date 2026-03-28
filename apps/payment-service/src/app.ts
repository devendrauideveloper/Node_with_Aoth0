import crypto from "node:crypto";
import Fastify from "fastify";
import { logger } from "@repo/shared";
import { registerRoutes } from "./routes/index.js";

export async function buildApp() {
  const app = Fastify({
    loggerInstance: logger,
    genReqId: (req) => (req.headers["x-correlation-id"] as string) ?? crypto.randomUUID()
  });
  await registerRoutes(app);
  return app;
}

