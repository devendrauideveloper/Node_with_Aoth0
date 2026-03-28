import crypto from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { env } from "@repo/config";
import { pool } from "@repo/database";
import { createCircuitBreaker, fetchJsonOrThrow, fetchWithTimeout } from "@repo/resilience";

// We validate Auth0 JWTs against the tenant's public keys instead of trusting
// incoming tokens blindly.
const jwks = createRemoteJWKSet(new URL(`https://${env.AUTH0_DOMAIN}/.well-known/jwks.json`));

// Auth0 is a synchronous dependency for login/refresh, so we protect it with
// circuit breakers just like any other external HTTP dependency.
const auth0TokenBreaker = createCircuitBreaker("auth0-token-endpoint", async (body: Record<string, unknown>) => {
  return fetchJsonOrThrow<any>(`https://${env.AUTH0_DOMAIN}/oauth/token`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
});

const auth0RevokeBreaker = createCircuitBreaker("auth0-revoke-endpoint", async (refreshToken: string) => {
  const response = await fetchWithTimeout(`https://${env.AUTH0_DOMAIN}/oauth/revoke`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      client_id: env.AUTH0_CLIENT_ID,
      client_secret: env.AUTH0_CLIENT_SECRET,
      token: refreshToken
    })
  });

  if (!response.ok) {
    throw new Error(`Revoke failed with status ${response.status}`);
  }
});

export function randomToken(size = 32): string {
  return crypto.randomBytes(size).toString("hex");
}

// We derive a fixed-length AES key from env config so refresh/access tokens are
// encrypted before being stored in Postgres.
function encryptionKey(): Buffer {
  return crypto.createHash("sha256").update(env.REFRESH_TOKEN_ENCRYPTION_KEY).digest();
}

export function encryptSecret(value: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("hex"), tag.toString("hex"), encrypted.toString("hex")].join(".");
}

export function decryptSecret(ciphertext: string): string {
  const [ivHex, tagHex, dataHex] = ciphertext.split(".");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const value = Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final()
  ]);
  return value.toString("utf8");
}

export async function verifyAccessToken(token: string) {
  const result = await jwtVerify(token, jwks, {
    issuer: `https://${env.AUTH0_DOMAIN}/`,
    audience: env.AUTH0_AUDIENCE
  });
  return result.payload;
}

// The nonce check protects the OIDC login flow from token substitution/replay.
export async function verifyIdToken(idToken: string, nonce: string) {
  const result = await jwtVerify(idToken, jwks, {
    issuer: `https://${env.AUTH0_DOMAIN}/`,
    audience: env.AUTH0_CLIENT_ID
  });

  if (result.payload.nonce !== nonce) {
    throw new Error("Invalid nonce in id_token");
  }

  return result.payload;
}

// The BFF redirects the browser to this URL to start OIDC login with Auth0.
export function buildAuthorizeUrl(input: { state: string; nonce: string; codeChallenge: string }): string {
  const params = new URLSearchParams({
    client_id: env.AUTH0_CLIENT_ID,
    response_type: "code",
    redirect_uri: env.AUTH0_REDIRECT_URI,
    scope: env.AUTH0_SCOPE,
    audience: env.AUTH0_AUDIENCE,
    state: input.state,
    nonce: input.nonce,
    code_challenge: input.codeChallenge,
    code_challenge_method: "S256"
  });
  return `https://${env.AUTH0_DOMAIN}/authorize?${params.toString()}`;
}

// The BFF uses this URL after local logout so the Auth0 session can also be cleared.
export function buildLogoutUrl(): string {
  const params = new URLSearchParams({
    client_id: env.AUTH0_CLIENT_ID,
    returnTo: env.AUTH0_POST_LOGOUT_REDIRECT_URI
  });
  return `https://${env.AUTH0_DOMAIN}/v2/logout?${params.toString()}`;
}

// PKCE gives the authorization code flow an extra proof step, which is important
// even for server-backed login flows.
export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomToken(32);
  const challenge = crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64url");
  return { verifier, challenge };
}

// Exchange the one-time auth code for tokens after Auth0 redirects back to the BFF.
export async function exchangeAuthorizationCode(code: string, codeVerifier: string) {
  return auth0TokenBreaker.fire({
      grant_type: "authorization_code",
      client_id: env.AUTH0_CLIENT_ID,
      client_secret: env.AUTH0_CLIENT_SECRET,
      code_verifier: codeVerifier,
      code,
      redirect_uri: env.AUTH0_REDIRECT_URI
    });
}

// Used by the BFF when the browser session is still valid but the server-side
// access token is close to expiry.
export async function refreshAuth0Tokens(refreshToken: string) {
  return auth0TokenBreaker.fire({
      grant_type: "refresh_token",
      client_id: env.AUTH0_CLIENT_ID,
      client_secret: env.AUTH0_CLIENT_SECRET,
      refresh_token: refreshToken
    });
}

export async function revokeRefreshToken(refreshToken: string) {
  await auth0RevokeBreaker.fire(refreshToken);
}

// Authorization is intentionally local: we map Auth0 users to local groups and
// privileges so business access rules stay under our control.
export async function getUserAuthorizations(auth0Sub: string): Promise<{ groups: string[]; privileges: string[] }> {
  const result = await pool.query<{
    group_code: string;
    privilege_code: string;
  }>(
    `
      SELECT g.code AS group_code, p.code AS privilege_code
      FROM identity.users u
      JOIN identity.user_group ug ON ug.user_id = u.id
      JOIN identity.groups g ON g.id = ug.group_id
      JOIN identity.group_privileges gp ON gp.group_id = g.id
      JOIN identity.privileges p ON p.id = gp.privilege_id
      WHERE u.auth0_sub = $1
    `,
    [auth0Sub]
  );

  const groups = [...new Set(result.rows.map((row) => row.group_code))];
  const privileges = [...new Set(result.rows.map((row) => row.privilege_code))];
  return { groups, privileges };
}
