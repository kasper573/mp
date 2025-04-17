import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import type { DbClient } from "./client";

export function createDbClient(connectionString: string): DbClient {
  const pool = new pg.Pool({ connectionString });
  return drizzle({ client: pool });
}
