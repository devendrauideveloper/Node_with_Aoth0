import express from "express";
import rateLimit from "express-rate-limit";
import { env } from "@repo/config";
import { registerRoutes } from "./routes/index.js";
import crypto from "node:crypto";

declare global {
  namespace Express {
    interface Request {
      id: string;
    }
  }
}

function parseWindowMs(window: string | number): number {
  if (typeof window === "number") return window;
  const match = window.match(/^(\d+)\s*(second|minute|hour|day)s?$/i);
  if (!match) return parseInt(window, 10);
  const value = parseInt(match[1]!, 10);
  const units: Record<string, number> = {
    second: 1000,
    minute: 60000,
    hour: 3600000,
    day: 86400000,
  };
  return value * (units[match[2]!.toLowerCase()] ?? 1000);
}

export function buildApp() {
  const app = express();

  app.use((req, _res, next) => {
    req.id = (req.headers["x-correlation-id"] as string) ?? crypto.randomUUID();
    next();
  });

  app.use(express.json());

  app.use(
    rateLimit({
      windowMs: parseWindowMs(env.GLOBAL_RATE_LIMIT_WINDOW),
      max: env.GLOBAL_RATE_LIMIT_MAX,
      message: { message: "Too many requests", statusCode: 429 },
    })
  );

  registerRoutes(app);
  return app;
}
