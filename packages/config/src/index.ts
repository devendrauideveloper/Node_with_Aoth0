import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.string().default("info"),
  POSTGRES_HOST: z.string(),
  POSTGRES_PORT: z.coerce.number().default(5432),
  POSTGRES_USER: z.string(),
  POSTGRES_PASSWORD: z.string(),
  POSTGRES_DB: z.string(),
  KAFKA_BROKERS: z.string().min(1),
  KAFKA_CLIENT_ID: z.string().default("commerce-platform"),
  KAFKA_SSL: z
    .string()
    .default("false")
    .transform((value) => value === "true"),
  KAFKA_SASL_MECHANISM: z.string().optional(),
  KAFKA_SASL_USERNAME: z.string().optional(),
  KAFKA_SASL_PASSWORD: z.string().optional(),
  AUTH0_DOMAIN: z.string(),
  AUTH0_CLIENT_ID: z.string(),
  AUTH0_CLIENT_SECRET: z.string(),
  AUTH0_AUDIENCE: z.string(),
  AUTH0_REDIRECT_URI: z.string().url(),
  AUTH0_POST_LOGOUT_REDIRECT_URI: z.string().url(),
  AUTH0_SCOPE: z.string().default("openid profile email offline_access"),
  SESSION_COOKIE_NAME: z.string().default("app_session"),
  SESSION_COOKIE_DOMAIN: z.string().default("localhost"),
  SESSION_SECRET: z.string().min(32),
  REFRESH_TOKEN_ENCRYPTION_KEY: z.string().min(32),
  CSRF_COOKIE_NAME: z.string().default("app_csrf"),
  BFF_PORT: z.coerce.number().default(3000),
  API_GATEWAY_PORT: z.coerce.number().default(4000),
  ORDER_SERVICE_PORT: z.coerce.number().default(4101),
  INVENTORY_SERVICE_PORT: z.coerce.number().default(4102),
  PAYMENT_SERVICE_PORT: z.coerce.number().default(4103),
  ORDER_SERVICE_URL: z.string().url(),
  INVENTORY_SERVICE_URL: z.string().url(),
  PAYMENT_SERVICE_URL: z.string().url(),
  API_GATEWAY_URL: z.string().url(),
  ACCESS_TOKEN_REFRESH_WINDOW_SECONDS: z.coerce.number().default(120),
  HTTP_TIMEOUT_MS: z.coerce.number().default(5000),
  GLOBAL_RATE_LIMIT_MAX: z.coerce.number().default(300),
  GLOBAL_RATE_LIMIT_WINDOW: z.string().default("1 minute"),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().default(20),
  AUTH_RATE_LIMIT_WINDOW: z.string().default("1 minute"),
  ORDER_RATE_LIMIT_MAX: z.coerce.number().default(60),
  ORDER_RATE_LIMIT_WINDOW: z.string().default("1 minute"),
  REPORT_RATE_LIMIT_MAX: z.coerce.number().default(120),
  REPORT_RATE_LIMIT_WINDOW: z.string().default("1 minute"),
  CIRCUIT_BREAKER_TIMEOUT_MS: z.coerce.number().default(4000),
  CIRCUIT_BREAKER_ERROR_THRESHOLD_PERCENTAGE: z.coerce.number().default(50),
  CIRCUIT_BREAKER_RESET_TIMEOUT_MS: z.coerce.number().default(15000)
});

export const env = envSchema.parse(process.env);
export const isProduction = env.NODE_ENV === "production";
