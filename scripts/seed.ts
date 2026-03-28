import crypto from "node:crypto";
import "dotenv/config";
import { pool } from "@repo/database";

async function main() {
  const auth0Sub = process.argv[2];
  const email = process.argv[3];
  const groupCode = (process.argv[4] ?? "ADMIN").toUpperCase();

  if (!auth0Sub || !email) {
    throw new Error("Usage: npm run db:seed -- <auth0-sub> <email> [ADMIN|MANAGER|USER]");
  }

  const result = await pool.query<{ id: string }>(
    `
      INSERT INTO identity.users (id, auth0_sub, email, display_name)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (auth0_sub)
      DO UPDATE SET email = EXCLUDED.email, display_name = EXCLUDED.display_name, updated_at = NOW()
      RETURNING id
    `,
    [crypto.randomUUID(), auth0Sub, email, email]
  );

  await pool.query(
    `
      INSERT INTO identity.user_group (user_id, group_id)
      SELECT $1, g.id
      FROM identity.groups g
      WHERE g.code = $2
      ON CONFLICT DO NOTHING
    `,
    [result.rows[0].id, groupCode]
  );

  console.log(`Seeded ${email} with group ${groupCode}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
