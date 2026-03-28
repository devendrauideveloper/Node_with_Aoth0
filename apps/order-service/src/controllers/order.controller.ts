import { orderCreateSchema } from "@repo/shared";
import { createOrder, getOrders } from "../services/order.service.js";

export async function createOrderController(request: any, reply: any) {
  const body = orderCreateSchema.parse(request.body);
  const userSub = request.headers["x-user-sub"];
  const idempotencyKey = request.headers["idempotency-key"];

  if (!userSub || typeof userSub !== "string") {
    return reply.code(400).send({ message: "Missing x-user-sub" });
  }
  if (!idempotencyKey || typeof idempotencyKey !== "string") {
    return reply.code(400).send({ message: "Missing Idempotency-Key header" });
  }

  const result = await createOrder({ body, userSub, idempotencyKey, correlationId: request.id });
  if (result.type === "conflict") {
    return reply.code(409).send(result.payload);
  }
  if (result.type === "replayed") {
    return reply.code(200).send(result.payload);
  }
  return reply.code(202).send(result.payload);
}

export async function listOrdersController(request: any) {
  const limit = Number((request.query as { limit?: number }).limit ?? 20);
  return getOrders(limit);
}

