import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { env } from "@repo/config";
import { logger } from "@repo/shared";
import { registerRoutes } from "./routes/index.js";
import crypto from "node:crypto";

export async function buildApp() {
  const app = Fastify({
    loggerInstance: logger,
    genReqId: (req) =>
      (req.headers["x-correlation-id"] as string) ?? crypto.randomUUID(),
  });

  app.addHook("onRequest", async (request, reply) => {
    reply.header("x-correlation-id", request.id);
  });

  await app.register(cookie, { secret: env.SESSION_SECRET });
  await app.register(cors, { origin: true, credentials: true });
  await app.register(rateLimit, {
    global: true,
    max: env.GLOBAL_RATE_LIMIT_MAX,
    timeWindow: env.GLOBAL_RATE_LIMIT_WINDOW,
    errorResponseBuilder: (_request, context) => ({
      message: "Too many requests",
      statusCode: 429,
      retryAfter: context.after,
    }),
  });

  await registerRoutes(app);
  return app;
}
