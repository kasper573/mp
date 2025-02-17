import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Logger } from "@mp/logger";

export type DBClient = ReturnType<typeof createDBClient>;

export function createDBClient(connectionString: string, logger: Logger) {
  const pool = new pg.Pool({ connectionString });
  pool.on("error", logger.error);
  return drizzle({ client: pool });
}
