import { env } from "@repo/config";
import { createCircuitBreaker, fetchWithTimeout } from "@repo/resilience";

const orderServiceBreaker = createCircuitBreaker(
  "api-gateway-order-service",
  async (path: string, init?: RequestInit) => fetchWithTimeout(path, init),
);

export async function forward(
  path: string,
  correlationId: string,
  init?: RequestInit,
) {
  const response = await orderServiceBreaker.fire(path, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      "x-correlation-id": correlationId,
    },
  });
  return {
    status: response.status,
    body: await response.text(),
    contentType: response.headers.get("content-type") ?? "application/json"
  };
}

export function buildOrderServiceUrl(path: string) {
  return `${env.ORDER_SERVICE_URL}${path}`;
}
