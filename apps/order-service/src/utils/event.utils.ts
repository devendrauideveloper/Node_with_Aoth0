import crypto from "node:crypto";

export function requestHash(body: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex");
}

export function createEventEnvelope<T extends Record<string, unknown>>(
  routingKey: string,
  payload: T,
  correlationId?: string
) {
  const eventId = crypto.randomUUID();
  return {
    eventId,
    routingKey,
    payload: {
      ...payload,
      eventId
    },
    headers: {
      eventId,
      ...(correlationId ? { correlationId } : {})
    }
  };
}

