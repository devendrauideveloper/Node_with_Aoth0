import { env } from "@repo/config";
import { decryptSecret, getUserAuthorizations, refreshAuth0Tokens } from "@repo/auth";
import { loadSession, updateSessionTokens } from "../repositories/session.repository.js";

export async function ensureFreshSession(sessionId: string) {
  const session = await loadSession(sessionId);
  if (!session) {
    return null;
  }

  const expiresAt = new Date(session.access_token_expires_at).getTime();
  const refreshWindowMs = env.ACCESS_TOKEN_REFRESH_WINDOW_SECONDS * 1000;

  if (expiresAt - Date.now() > refreshWindowMs) {
    return session;
  }

  const refreshed = await refreshAuth0Tokens(decryptSecret(session.refresh_token_ciphertext));
  await updateSessionTokens({
    sessionId: session.id,
    accessToken: refreshed.access_token as string,
    accessTokenExpiresAt: new Date(Date.now() + Number(refreshed.expires_in) * 1000),
    refreshToken: (refreshed.refresh_token as string | undefined) ?? decryptSecret(session.refresh_token_ciphertext)
  });

  return loadSession(sessionId);
}

export async function requireSession(request: any, reply: any) {
  const signed = request.unsignCookie(request.cookies[env.SESSION_COOKIE_NAME] ?? "");
  if (!signed.valid || !signed.value) {
    return reply.code(401).send({ message: "Unauthenticated" });
  }

  const session = await ensureFreshSession(signed.value);
  if (!session) {
    return reply.code(401).send({ message: "Session expired" });
  }

  request.session = session;
}

export function requireCsrf(request: any, reply: any): boolean {
  const csrfHeader = request.headers["x-csrf-token"];
  const csrfCookie = request.cookies[env.CSRF_COOKIE_NAME];
  if (!csrfHeader || csrfHeader !== csrfCookie || csrfHeader !== request.session.csrf_token) {
    void reply.code(403).send({ message: "CSRF validation failed" });
    return false;
  }
  return true;
}

export async function buildSessionView(session: any) {
  const authorizations = await getUserAuthorizations(session.auth0_sub);
  const expiresAt = new Date(session.access_token_expires_at).toISOString();

  return {
    isAuthenticated: true,
    user: {
      sub: session.auth0_sub,
      email: session.email,
      displayName: session.display_name
    },
    authorizations,
    accessTokenExpiresAt: expiresAt,
    shouldRefresh: new Date(expiresAt).getTime() - Date.now() <= env.ACCESS_TOKEN_REFRESH_WINDOW_SECONDS * 1000
  };
}

