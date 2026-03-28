import { env } from "@repo/config";
import { assignGroupMembershipController } from "../controllers/admin.controller.js";
import { callbackController, loginController, logoutController, refreshController, sessionController } from "../controllers/auth.controller.js";
import { healthController } from "../controllers/health.controller.js";
import { createOrderController, listOrderReportsController } from "../controllers/order.controller.js";
import { requireSession } from "../services/session.service.js";

export async function registerRoutes(app: any) {
  app.get("/health", healthController);

  app.get("/auth/login", {
    config: {
      rateLimit: { max: env.AUTH_RATE_LIMIT_MAX, timeWindow: env.AUTH_RATE_LIMIT_WINDOW }
    }
  }, loginController);

  app.get("/auth/callback", {
    config: {
      rateLimit: { max: env.AUTH_RATE_LIMIT_MAX, timeWindow: env.AUTH_RATE_LIMIT_WINDOW }
    }
  }, callbackController);

  app.get("/auth/session", { preHandler: requireSession }, sessionController);

  app.post("/auth/refresh", {
    preHandler: requireSession,
    config: {
      rateLimit: { max: env.AUTH_RATE_LIMIT_MAX, timeWindow: env.AUTH_RATE_LIMIT_WINDOW }
    }
  }, refreshController);

  app.post("/auth/logout", {
    preHandler: requireSession,
    config: {
      rateLimit: { max: env.AUTH_RATE_LIMIT_MAX, timeWindow: env.AUTH_RATE_LIMIT_WINDOW }
    }
  }, logoutController);

  app.post("/admin/group-memberships", {
    preHandler: requireSession,
    config: {
      rateLimit: { max: env.ORDER_RATE_LIMIT_MAX, timeWindow: env.ORDER_RATE_LIMIT_WINDOW }
    }
  }, assignGroupMembershipController);

  app.get("/bff/reports/orders", {
    preHandler: requireSession,
    config: {
      rateLimit: { max: env.REPORT_RATE_LIMIT_MAX, timeWindow: env.REPORT_RATE_LIMIT_WINDOW }
    }
  }, listOrderReportsController);

  app.post("/bff/orders", {
    preHandler: requireSession,
    config: {
      rateLimit: { max: env.ORDER_RATE_LIMIT_MAX, timeWindow: env.ORDER_RATE_LIMIT_WINDOW }
    }
  }, createOrderController);
}
