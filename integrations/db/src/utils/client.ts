import type { Pool } from "pg";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

export type DrizzleClient = ReturnType<
  typeof drizzle<Record<string, never>, Pool>
>;

export function createDrizzleClient(connectionString: string): DrizzleClient {
  return drizzle(new pg.Pool({ connectionString }));
}
