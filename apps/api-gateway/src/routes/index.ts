import { env } from "@repo/config";
import { healthController } from "../controllers/health.controller.js";
import { createOrderController, listOrderReportsController } from "../controllers/order.controller.js";
import { authorize, requirePrivilege } from "../services/authz.service.js";

export async function registerRoutes(app: any) {
  app.get("/health", healthController);

  app.post("/orders", {
    preHandler: [authorize, requirePrivilege("ORDER_CREATE")],
    config: {
      rateLimit: { max: env.ORDER_RATE_LIMIT_MAX, timeWindow: env.ORDER_RATE_LIMIT_WINDOW }
    }
  }, createOrderController);

  app.get("/reports/orders", {
    preHandler: [authorize, requirePrivilege("READ")],
    config: {
      rateLimit: { max: env.REPORT_RATE_LIMIT_MAX, timeWindow: env.REPORT_RATE_LIMIT_WINDOW }
    }
  }, listOrderReportsController);
}
