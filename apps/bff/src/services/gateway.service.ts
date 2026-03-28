import type { Request, Response } from "express";
import { env } from "@repo/config";
import { createCircuitBreaker, fetchWithTimeout } from "@repo/resilience";

const gatewayBreaker = createCircuitBreaker(
  "bff-api-gateway",
  async (path: string, init: RequestInit = {}) =>
    fetchWithTimeout(`${env.API_GATEWAY_URL}${path}`, init),
);

export async function proxyToGateway(
  req: Request,
  res: Response,
  path: string,
  init: RequestInit = {},
) {
  const response = await gatewayBreaker.fire(path, {
    ...init,
    headers: {
      authorization: `Bearer ${req.session.access_token}`,
      "content-type": "application/json",
      "x-correlation-id": req.id,
      ...(init.headers ?? {}),
    },
  });

  const bodyText = await response.text();
  res.status(response.status);

  if (!bodyText) {
    res.send();
    return;
  }

  res.set("content-type", response.headers.get("content-type") ?? "application/json").send(bodyText);
}
