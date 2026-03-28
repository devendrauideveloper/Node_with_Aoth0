import type { Request, Response } from "express";
import { env } from "@repo/config";
import { buildAuthorizeUrl, buildLogoutUrl, createPkcePair, decryptSecret, exchangeAuthorizationCode, randomToken, revokeRefreshToken, verifyIdToken } from "@repo/auth";
import { cookieOptions, csrfOptions } from "../services/cookie.service.js";
import { createUserSession, revokeSession } from "../repositories/session.repository.js";
import { buildSessionView, ensureFreshSession, requireCsrf } from "../services/session.service.js";

export async function loginController(req: Request, res: Response) {
  const { verifier, challenge } = createPkcePair();
  const state = randomToken();
  const nonce = randomToken();

  res.cookie("auth0_tx", JSON.stringify({ verifier, state, nonce }), cookieOptions(600));
  res.redirect(buildAuthorizeUrl({ state, nonce, codeChallenge: challenge }));
}

export async function callbackController(req: Request, res: Response) {
  const { code, state } = req.query as { code?: string; state?: string };
  if (!code || !state) {
    res.status(400).json({ message: "Missing code or state" });
    return;
  }

  const txRaw = req.signedCookies["auth0_tx"] as string | false;
  if (!txRaw) {
    res.status(400).json({ message: "Missing login transaction" });
    return;
  }

  const tx = JSON.parse(txRaw) as { verifier: string; state: string; nonce: string };
  if (tx.state !== state) {
    res.status(400).json({ message: "Invalid state" });
    return;
  }

  const tokenSet = await exchangeAuthorizationCode(code, tx.verifier);
  const idPayload = await verifyIdToken(tokenSet.id_token as string, tx.nonce);
  const csrfToken = randomToken();

  const sessionId = await createUserSession({
    auth0Sub: String(idPayload.sub),
    email: String(idPayload.email ?? `${String(idPayload.sub)}@local.invalid`),
    displayName: String(idPayload.name ?? idPayload.email ?? idPayload.sub),
    refreshToken: String(tokenSet.refresh_token),
    accessToken: String(tokenSet.access_token),
    accessTokenExpiresAt: new Date(Date.now() + Number(tokenSet.expires_in) * 1000),
    idToken: String(tokenSet.id_token),
    csrfToken
  });

  res.clearCookie("auth0_tx", { path: "/" });
  res.cookie(env.SESSION_COOKIE_NAME, sessionId, cookieOptions(60 * 60 * 24 * 30));
  res.cookie(env.CSRF_COOKIE_NAME, csrfToken, csrfOptions());
  res.redirect("/");
}

export async function sessionController(req: Request, res: Response) {
  res.json(await buildSessionView(req.session));
}

export async function refreshController(req: Request, res: Response) {
  if (!requireCsrf(req, res)) return;

  const session = await ensureFreshSession(req.session.id);
  res.json({ ok: true, accessTokenExpiresAt: session?.access_token_expires_at });
}

export async function logoutController(req: Request, res: Response) {
  if (!requireCsrf(req, res)) return;

  await revokeRefreshToken(decryptSecret(req.session.refresh_token_ciphertext));
  await revokeSession(req.session.id);
  res.clearCookie(env.SESSION_COOKIE_NAME, { path: "/" });
  res.clearCookie(env.CSRF_COOKIE_NAME, { path: "/" });
  res.json({ ok: true, logoutUrl: buildLogoutUrl() });
}
