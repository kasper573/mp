import type { Pool } from "pg";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Logger } from "drizzle-orm";

export type DbClient = ReturnType<typeof drizzle<Record<string, never>, Pool>>;

export function createDbClient(
  connectionString: string,
  logger?: Logger,
): DbClient {
  const pool = new pg.Pool({ connectionString });
  return drizzle({ client: pool, logger });
}
