import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

export type DBClient = ReturnType<typeof createDBClient>;

export function createDBClient(connectionString: string) {
  const pool = new Pool({ connectionString });
  return drizzle({ client: pool });
}
