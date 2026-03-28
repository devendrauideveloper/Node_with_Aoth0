import { healthController } from "../controllers/health.controller.js";

export function registerRoutes(app: any) {
  app.get("/health", healthController);
}
