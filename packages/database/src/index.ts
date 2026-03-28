import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { env } from "@repo/config";

// A pool lets all services reuse a small set of DB connections instead of opening
// a new TCP connection for every query, which is much cheaper under load.
export const pool = new Pool({
  host: env.POSTGRES_HOST,
  port: env.POSTGRES_PORT,
  user: env.POSTGRES_USER,
  password: env.POSTGRES_PASSWORD,
  database: env.POSTGRES_DB,
  max: 20
});

// Many business actions need "all-or-nothing" behavior, for example:
// create an order row + create an outbox row in the same commit.
export async function withTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// Small helper for read queries where callers only expect a single row.
export async function one<T extends QueryResultRow>(queryText: string, params: unknown[] = []): Promise<T | null> {
  const result = await pool.query<T>(queryText, params);
  return result.rows[0] ?? null;
}
