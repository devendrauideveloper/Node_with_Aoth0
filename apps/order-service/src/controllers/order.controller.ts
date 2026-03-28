import type { Request, Response } from "express";
import { orderCreateSchema } from "@repo/shared";
import { createOrder, getOrders } from "../services/order.service.js";

export async function createOrderController(req: Request, res: Response) {
  const body = orderCreateSchema.parse(req.body);
  const userSub = req.headers["x-user-sub"];
  const idempotencyKey = req.headers["idempotency-key"];

  if (!userSub || typeof userSub !== "string") {
    res.status(400).json({ message: "Missing x-user-sub" });
    return;
  }
  if (!idempotencyKey || typeof idempotencyKey !== "string") {
    res.status(400).json({ message: "Missing Idempotency-Key header" });
    return;
  }

  const result = await createOrder({ body, userSub, idempotencyKey, correlationId: req.id });
  if (result.type === "conflict") {
    res.status(409).json(result.payload);
    return;
  }
  if (result.type === "replayed") {
    res.status(200).json(result.payload);
    return;
  }
  res.status(202).json(result.payload);
}

export async function listOrdersController(req: Request, res: Response) {
  const limit = Number((req.query as { limit?: string }).limit ?? 20);
  res.json(await getOrders(limit));
}
