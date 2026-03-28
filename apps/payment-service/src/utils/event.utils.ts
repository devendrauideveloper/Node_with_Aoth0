import crypto from "node:crypto";

export function createEventEnvelope<T extends Record<string, unknown>>(routingKey: string, payload: T) {
  const eventId = crypto.randomUUID();
  return {
    eventId,
    routingKey,
    payload: {
      ...payload,
      eventId
    },
    headers: {
      eventId
    }
  };
}

