import { orderCreateSchema, reportQuerySchema } from "@repo/shared";
import { proxyToGateway } from "../services/gateway.service.js";
import { requireCsrf } from "../services/session.service.js";

export async function listOrderReportsController(request: any, reply: any) {
  const query = reportQuerySchema.parse(request.query);
  return proxyToGateway(request, reply, `/reports/orders?limit=${query.limit}`);
}

export async function createOrderController(request: any, reply: any) {
  if (!requireCsrf(request, reply)) {
    return;
  }

  const idempotencyKey = request.headers["idempotency-key"];
  if (!idempotencyKey || typeof idempotencyKey !== "string") {
    return reply.code(400).send({ message: "Missing Idempotency-Key header" });
  }

  const body = orderCreateSchema.parse(request.body);
  return proxyToGateway(request, reply, "/orders", {
    method: "POST",
    headers: {
      "idempotency-key": idempotencyKey
    },
    body: JSON.stringify(body)
  });
}

