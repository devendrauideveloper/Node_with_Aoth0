import { env } from "@repo/config";
import { createCircuitBreaker, fetchWithTimeout } from "@repo/resilience";

const gatewayBreaker = createCircuitBreaker(
  "bff-api-gateway",
  async (path: string, init: RequestInit = {}) =>
    fetchWithTimeout(`${env.API_GATEWAY_URL}${path}`, init),
);

export async function proxyToGateway(
  request: any,
  reply: any,
  path: string,
  init: RequestInit = {},
) {
  const response = await gatewayBreaker.fire(path, {
    ...init,
    headers: {
      authorization: `Bearer ${request.session.access_token}`,
      "content-type": "application/json",
      "x-correlation-id": request.id,
      ...(init.headers ?? {}),
    },
  });

  const bodyText = await response.text();
  reply.code(response.status);
  if (!bodyText) {
    return reply.send();
  }

  return reply
    .type(response.headers.get("content-type") ?? "application/json")
    .send(bodyText);
}
