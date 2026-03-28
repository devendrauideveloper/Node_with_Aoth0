import pino from "pino";
import { env } from "@repo/config";
import { z } from "zod";

export const logger = pino({
  name: "commerce-platform",
  level: env.LOG_LEVEL,
  transport: env.NODE_ENV === "development"
    ? {
        target: "pino-pretty",
        options: {
          colorize: true
        }
      }
    : undefined
});

export const orderCreateSchema = z.object({
  itemSku: z.string().min(3),
  quantity: z.number().int().positive(),
  totalAmount: z.number().positive(),
  currency: z.string().length(3)
});

export const reportQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(20)
});

export type OrderCreateInput = z.infer<typeof orderCreateSchema>;

export const topics = {
  order: "order.events",
  inventory: "inventory.events",
  payment: "payment.events"
} as const;

export const routingKeys = {
  orderCreated: "order.created",
  reserveInventory: "inventory.reserve.requested",
  inventoryReserved: "inventory.reserved",
  inventoryRejected: "inventory.rejected",
  processPayment: "payment.process.requested",
  paymentSucceeded: "payment.succeeded",
  paymentFailed: "payment.failed",
  releaseInventory: "inventory.release.requested"
} as const;

