import express from "express";
import crypto from "node:crypto";
import { registerRoutes } from "./routes/index.js";

declare global {
  namespace Express {
    interface Request {
      id: string;
    }
  }
}

export function buildApp() {
  const app = express();

  app.use((req, _res, next) => {
    req.id = (req.headers["x-correlation-id"] as string) ?? crypto.randomUUID();
    next();
  });

  app.use(express.json());
  registerRoutes(app);
  return app;
}
