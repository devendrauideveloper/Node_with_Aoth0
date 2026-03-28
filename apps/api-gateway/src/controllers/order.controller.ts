import type { Request, Response } from "express";
import { orderCreateSchema, reportQuerySchema } from "@repo/shared";
import { buildOrderServiceUrl, forward } from "../services/order-forward.service.js";

export async function createOrderController(req: Request, res: Response) {
  const body = orderCreateSchema.parse(req.body);
  const idempotencyKey = req.headers["idempotency-key"];
  if (!idempotencyKey || typeof idempotencyKey !== "string") {
    res.status(400).json({ message: "Missing Idempotency-Key header" });
    return;
  }

  const forwarded = await forward(buildOrderServiceUrl("/internal/orders"), req.id, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-user-sub": req.auth.sub,
      "idempotency-key": idempotencyKey
    },
    body: JSON.stringify(body)
  });

  res.status(forwarded.status).set("content-type", forwarded.contentType).send(forwarded.body);
}

export async function listOrderReportsController(req: Request, res: Response) {
  const query = reportQuerySchema.parse(req.query);
  const forwarded = await forward(buildOrderServiceUrl(`/internal/orders?limit=${query.limit}`), req.id, {
    headers: { "x-user-sub": req.auth.sub }
  });

  res.status(forwarded.status).set("content-type", forwarded.contentType).send(forwarded.body);
}
