import CircuitBreaker from "opossum";
import { env } from "@repo/config";
import { logger } from "@repo/shared";

// We wrap outbound HTTP calls with a circuit breaker so one unhealthy downstream
// service does not keep dragging the whole app into repeated slow failures.
export function createCircuitBreaker<TArgs extends unknown[], TResult>(
  name: string,
  action: (...args: TArgs) => Promise<TResult>
) {
  const breaker = new CircuitBreaker(action, {
    timeout: env.CIRCUIT_BREAKER_TIMEOUT_MS,
    errorThresholdPercentage: env.CIRCUIT_BREAKER_ERROR_THRESHOLD_PERCENTAGE,
    resetTimeout: env.CIRCUIT_BREAKER_RESET_TIMEOUT_MS
  });

  breaker.on("open", () => logger.warn({ breaker: name }, "circuit breaker opened"));
  breaker.on("halfOpen", () => logger.warn({ breaker: name }, "circuit breaker half-open"));
  breaker.on("close", () => logger.info({ breaker: name }, "circuit breaker closed"));
  breaker.on("reject", () => logger.warn({ breaker: name }, "circuit breaker rejected request"));
  breaker.on("timeout", () => logger.error({ breaker: name }, "circuit breaker timed out"));
  breaker.on("failure", (error: unknown) => logger.error({ breaker: name, err: error }, "circuit breaker action failed"));

  return breaker;
}

// Timeouts are just as important as retries: if a dependency hangs, we want to
// fail fast and let the breaker learn from that failure.
export async function fetchWithTimeout(input: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(input, {
    ...init,
    signal: AbortSignal.timeout(env.HTTP_TIMEOUT_MS)
  });
  return response;
}

// Most callers expect JSON responses and want non-2xx responses treated as failures.
export async function fetchJsonOrThrow<T>(input: string, init: RequestInit = {}): Promise<T> {
  const response = await fetchWithTimeout(input, init);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Request failed with status ${response.status}: ${text}`);
  }
  return response.json() as Promise<T>;
}
