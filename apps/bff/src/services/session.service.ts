import type { Request, Response, NextFunction } from "express";
import { env } from "@repo/config";
import { decryptSecret, getUserAuthorizations, refreshAuth0Tokens } from "@repo/auth";
import { loadSession, updateSessionTokens } from "../repositories/session.repository.js";
import type { AppSession } from "../types/session.types.js";

declare global {
  namespace Express {
    interface Request {
      session: AppSession;
    }
  }
}

export async function ensureFreshSession(sessionId: string) {
  const session = await loadSession(sessionId);
  if (!session) return null;

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

export async function requireSession(req: Request, res: Response, next: NextFunction) {
  const sessionId = req.signedCookies[env.SESSION_COOKIE_NAME] as string | false;
  if (!sessionId) {
    res.status(401).json({ message: "Unauthenticated" });
    return;
  }

  const session = await ensureFreshSession(sessionId);
  if (!session) {
    res.status(401).json({ message: "Session expired" });
    return;
  }

  req.session = session;
  next();
}

export function requireCsrf(req: Request, res: Response): boolean {
  const csrfHeader = req.headers["x-csrf-token"];
  const csrfCookie = req.cookies[env.CSRF_COOKIE_NAME];
  if (!csrfHeader || csrfHeader !== csrfCookie || csrfHeader !== req.session.csrf_token) {
    res.status(403).json({ message: "CSRF validation failed" });
    return false;
  }
  return true;
}

export async function buildSessionView(session: AppSession) {
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
