import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import type { DBClient } from "./client";

export function createDBClient(connectionString: string): DBClient {
  const pool = new pg.Pool({ connectionString });
  return drizzle({ client: pool });
}
