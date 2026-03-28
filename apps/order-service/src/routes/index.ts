import { healthController } from "../controllers/health.controller.js";
import { createOrderController, listOrdersController } from "../controllers/order.controller.js";

export async function registerRoutes(app: any) {
  app.get("/health", healthController);
  app.post("/internal/orders", createOrderController);
  app.get("/internal/orders", listOrdersController);
}
