import type { Request, Response } from "express";
import { orderCreateSchema, reportQuerySchema } from "@repo/shared";
import { proxyToGateway } from "../services/gateway.service.js";
import { requireCsrf } from "../services/session.service.js";

export async function listOrderReportsController(req: Request, res: Response) {
  const query = reportQuerySchema.parse(req.query);
  await proxyToGateway(req, res, `/reports/orders?limit=${query.limit}`);
}

export async function createOrderController(req: Request, res: Response) {
  if (!requireCsrf(req, res)) return;

  const idempotencyKey = req.headers["idempotency-key"];
  if (!idempotencyKey || typeof idempotencyKey !== "string") {
    res.status(400).json({ message: "Missing Idempotency-Key header" });
    return;
  }

  const body = orderCreateSchema.parse(req.body);
  await proxyToGateway(req, res, "/orders", {
    method: "POST",
    headers: { "idempotency-key": idempotencyKey },
    body: JSON.stringify(body)
  });
}
