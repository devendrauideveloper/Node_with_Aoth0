declare module "opossum" {
  export interface CircuitBreakerOptions {
    timeout?: number;
    errorThresholdPercentage?: number;
    resetTimeout?: number;
  }

  export default class CircuitBreaker<TArgs extends unknown[] = unknown[], TResult = unknown> {
    constructor(action: (...args: TArgs) => Promise<TResult>, options?: CircuitBreakerOptions);
    fire(...args: TArgs): Promise<TResult>;
    on(
      event: "open" | "halfOpen" | "close" | "reject" | "timeout" | "failure",
      listener: (...args: unknown[]) => void
    ): void;
  }
}
