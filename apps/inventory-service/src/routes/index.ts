import { healthController } from "../controllers/health.controller.js";

export async function registerRoutes(app: any) {
  app.get("/health", healthController);
}
