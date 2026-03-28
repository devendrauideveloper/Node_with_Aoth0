import rateLimit from "express-rate-limit";
import { env } from "@repo/config";
import { healthController } from "../controllers/health.controller.js";
import { createOrderController, listOrderReportsController } from "../controllers/order.controller.js";
import { authorize, requirePrivilege } from "../services/authz.service.js";

function parseWindowMs(window: string | number): number {
  if (typeof window === "number") return window;
  const match = window.match(/^(\d+)\s*(second|minute|hour|day)s?$/i);
  if (!match) return parseInt(window, 10);
  const value = parseInt(match[1]!, 10);
  const units: Record<string, number> = { second: 1000, minute: 60000, hour: 3600000, day: 86400000 };
  return value * (units[match[2]!.toLowerCase()] ?? 1000);
}

const orderLimiter = rateLimit({
  windowMs: parseWindowMs(env.ORDER_RATE_LIMIT_WINDOW),
  max: env.ORDER_RATE_LIMIT_MAX,
  message: { message: "Too many requests", statusCode: 429 },
});

const reportLimiter = rateLimit({
  windowMs: parseWindowMs(env.REPORT_RATE_LIMIT_WINDOW),
  max: env.REPORT_RATE_LIMIT_MAX,
  message: { message: "Too many requests", statusCode: 429 },
});

export function registerRoutes(app: any) {
  app.get("/health", healthController);
  app.post("/orders", orderLimiter, authorize, requirePrivilege("ORDER_CREATE"), createOrderController);
  app.get("/reports/orders", reportLimiter, authorize, requirePrivilege("READ"), listOrderReportsController);
}
