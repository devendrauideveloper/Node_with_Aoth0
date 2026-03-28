import { env, isProduction } from "@repo/config";

export function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax" as const,
    domain: env.SESSION_COOKIE_DOMAIN === "localhost" ? undefined : env.SESSION_COOKIE_DOMAIN,
    path: "/",
    maxAge: maxAgeSeconds,
    signed: true
  };
}

export function csrfOptions() {
  return {
    httpOnly: false,
    secure: isProduction,
    sameSite: "lax" as const,
    domain: env.SESSION_COOKIE_DOMAIN === "localhost" ? undefined : env.SESSION_COOKIE_DOMAIN,
    path: "/"
  };
}

