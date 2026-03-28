import { orderCreateSchema, reportQuerySchema } from "@repo/shared";
import { buildOrderServiceUrl, forward } from "../services/order-forward.service.js";

export async function createOrderController(request: any, reply: any) {
  const body = orderCreateSchema.parse(request.body);
  const idempotencyKey = request.headers["idempotency-key"];
  if (!idempotencyKey || typeof idempotencyKey !== "string") {
    return reply.code(400).send({ message: "Missing Idempotency-Key header" });
  }

  const forwarded = await forward(buildOrderServiceUrl("/internal/orders"), request.id, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-user-sub": request.auth.sub,
      "idempotency-key": idempotencyKey
    },
    body: JSON.stringify(body)
  });

  return reply.code(forwarded.status).type(forwarded.contentType).send(forwarded.body);
}

export async function listOrderReportsController(request: any, reply: any) {
  const query = reportQuerySchema.parse(request.query);
  const forwarded = await forward(buildOrderServiceUrl(`/internal/orders?limit=${query.limit}`), request.id, {
    headers: {
      "x-user-sub": request.auth.sub
    }
  });

  return reply.code(forwarded.status).type(forwarded.contentType).send(forwarded.body);
}

