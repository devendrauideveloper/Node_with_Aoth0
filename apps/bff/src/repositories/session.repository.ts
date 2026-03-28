import crypto from "node:crypto";
import { pool } from "@repo/database";
import { decryptSecret, encryptSecret } from "@repo/auth";
import type { AppSession, GroupMembershipPayload } from "../types/session.types.js";

export async function loadSession(sessionId: string): Promise<AppSession | null> {
  const result = await pool.query<AppSession>(
    `
      SELECT s.id, s.access_token, s.access_token_expires_at, s.refresh_token_ciphertext, s.refresh_token_expires_at,
             s.csrf_token, u.auth0_sub, u.email, u.display_name
      FROM identity.sessions s
      JOIN identity.users u ON u.id = s.user_id
      WHERE s.id = $1 AND s.revoked_at IS NULL
    `,
    [sessionId]
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    ...row,
    access_token: decryptSecret(row.access_token)
  };
}

export async function updateSessionTokens(input: {
  sessionId: string;
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string;
}): Promise<void> {
  await pool.query(
    `
      UPDATE identity.sessions
      SET access_token = $2,
          access_token_expires_at = $3,
          refresh_token_ciphertext = $4,
          updated_at = NOW()
      WHERE id = $1
    `,
    [input.sessionId, encryptSecret(input.accessToken), input.accessTokenExpiresAt, encryptSecret(input.refreshToken)]
  );
}

export async function createUserSession(input: {
  auth0Sub: string;
  email: string;
  displayName: string;
  refreshToken: string;
  accessToken: string;
  accessTokenExpiresAt: Date;
  idToken: string;
  csrfToken: string;
}): Promise<string> {
  const sessionId = crypto.randomUUID();
  const userIdResult = await pool.query<{ id: string }>(
    `
      INSERT INTO identity.users (id, auth0_sub, email, display_name)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (auth0_sub)
      DO UPDATE SET email = EXCLUDED.email, display_name = EXCLUDED.display_name, updated_at = NOW()
      RETURNING id
    `,
    [crypto.randomUUID(), input.auth0Sub, input.email, input.displayName]
  );

  await pool.query(
    `
      INSERT INTO identity.sessions (
        id, user_id, refresh_token_ciphertext, refresh_token_expires_at,
        access_token, access_token_expires_at, id_token, csrf_token
      )
      VALUES ($1, $2, $3, NOW() + INTERVAL '30 days', $4, $5, $6, $7)
    `,
    [
      sessionId,
      userIdResult.rows[0].id,
      encryptSecret(input.refreshToken),
      encryptSecret(input.accessToken),
      input.accessTokenExpiresAt,
      input.idToken,
      input.csrfToken
    ]
  );

  return sessionId;
}

export async function revokeSession(sessionId: string): Promise<void> {
  await pool.query("UPDATE identity.sessions SET revoked_at = NOW() WHERE id = $1", [sessionId]);
}

export async function upsertUserGroupMembership(body: GroupMembershipPayload): Promise<void> {
  const userId = crypto.randomUUID();
  const inserted = await pool.query<{ id: string }>(
    `
      INSERT INTO identity.users (id, auth0_sub, email, display_name)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (auth0_sub)
      DO UPDATE SET email = EXCLUDED.email, display_name = EXCLUDED.display_name, updated_at = NOW()
      RETURNING id
    `,
    [userId, body.auth0Sub, body.email, body.displayName ?? body.email]
  );

  await pool.query(
    `
      INSERT INTO identity.user_group (user_id, group_id)
      SELECT $1, g.id
      FROM identity.groups g
      WHERE g.code = $2
      ON CONFLICT DO NOTHING
    `,
    [inserted.rows[0].id, body.groupCode]
  );
}

