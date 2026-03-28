import rateLimit from "express-rate-limit";
import { env } from "@repo/config";
import { assignGroupMembershipController } from "../controllers/admin.controller.js";
import { callbackController, loginController, logoutController, refreshController, sessionController } from "../controllers/auth.controller.js";
import { healthController } from "../controllers/health.controller.js";
import { createOrderController, listOrderReportsController } from "../controllers/order.controller.js";
import { requireSession } from "../services/session.service.js";

function parseWindowMs(window: string | number): number {
  if (typeof window === "number") return window;
  const match = window.match(/^(\d+)\s*(second|minute|hour|day)s?$/i);
  if (!match) return parseInt(window, 10);
  const value = parseInt(match[1]!, 10);
  const units: Record<string, number> = { second: 1000, minute: 60000, hour: 3600000, day: 86400000 };
  return value * (units[match[2]!.toLowerCase()] ?? 1000);
}

const authLimiter = rateLimit({
  windowMs: parseWindowMs(env.AUTH_RATE_LIMIT_WINDOW),
  max: env.AUTH_RATE_LIMIT_MAX,
  message: { message: "Too many requests", statusCode: 429 },
});

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
  app.get("/auth/login", authLimiter, loginController);
  app.get("/auth/callback", authLimiter, callbackController);
  app.get("/auth/session", requireSession, sessionController);
  app.post("/auth/refresh", authLimiter, requireSession, refreshController);
  app.post("/auth/logout", authLimiter, requireSession, logoutController);
  app.post("/admin/group-memberships", orderLimiter, requireSession, assignGroupMembershipController);
  app.get("/bff/reports/orders", reportLimiter, requireSession, listOrderReportsController);
  app.post("/bff/orders", orderLimiter, requireSession, createOrderController);
}
