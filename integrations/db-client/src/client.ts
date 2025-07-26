import type { Pool } from "pg";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

export type DbClient = ReturnType<typeof drizzle<Record<string, never>, Pool>>;

export function createDbClient(connectionString: string): DbClient {
  const pool = new pg.Pool({ connectionString });
  return drizzle({ client: pool });
}
