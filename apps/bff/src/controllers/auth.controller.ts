import { env } from "@repo/config";
import { buildAuthorizeUrl, buildLogoutUrl, createPkcePair, decryptSecret, exchangeAuthorizationCode, randomToken, revokeRefreshToken, verifyIdToken } from "@repo/auth";
import { cookieOptions, csrfOptions } from "../services/cookie.service.js";
import { createUserSession, revokeSession } from "../repositories/session.repository.js";
import { buildSessionView, ensureFreshSession, requireCsrf } from "../services/session.service.js";

export async function loginController(_request: any, reply: any) {
  const { verifier, challenge } = createPkcePair();
  const state = randomToken();
  const nonce = randomToken();

  reply.setCookie("auth0_tx", JSON.stringify({ verifier, state, nonce }), {
    ...cookieOptions(600)
  });

  reply.redirect(buildAuthorizeUrl({ state, nonce, codeChallenge: challenge }));
}

export async function callbackController(request: any, reply: any) {
  const { code, state } = request.query as { code?: string; state?: string };
  if (!code || !state) {
    return reply.code(400).send({ message: "Missing code or state" });
  }

  const signed = request.unsignCookie(request.cookies.auth0_tx ?? "");
  if (!signed.valid || !signed.value) {
    return reply.code(400).send({ message: "Missing login transaction" });
  }

  const tx = JSON.parse(signed.value) as { verifier: string; state: string; nonce: string };
  if (tx.state !== state) {
    return reply.code(400).send({ message: "Invalid state" });
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

  reply.clearCookie("auth0_tx", { path: "/" });
  reply.setCookie(env.SESSION_COOKIE_NAME, sessionId, cookieOptions(60 * 60 * 24 * 30));
  reply.setCookie(env.CSRF_COOKIE_NAME, csrfToken, csrfOptions());
  reply.redirect("/");
}

export async function sessionController(request: any) {
  return buildSessionView(request.session);
}

export async function refreshController(request: any, reply: any) {
  if (!requireCsrf(request, reply)) {
    return;
  }

  const session = await ensureFreshSession(request.session.id);
  return {
    ok: true,
    accessTokenExpiresAt: session?.access_token_expires_at
  };
}

export async function logoutController(request: any, reply: any) {
  if (!requireCsrf(request, reply)) {
    return;
  }

  await revokeRefreshToken(decryptSecret(request.session.refresh_token_ciphertext));
  await revokeSession(request.session.id);
  reply.clearCookie(env.SESSION_COOKIE_NAME, { path: "/" });
  reply.clearCookie(env.CSRF_COOKIE_NAME, { path: "/" });
  return { ok: true, logoutUrl: buildLogoutUrl() };
}
