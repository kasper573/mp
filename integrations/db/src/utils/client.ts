import type { Pool } from "pg";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

export type DrizzleClient = ReturnType<
  typeof drizzle<Record<string, never>, Pool>
>;

export function createDrizzleClient(connectionString: string): DrizzleClient {
  // Configure pg.Pool with resilient defaults
  // The pool will automatically attempt to reconnect on connection failures
  const pool = new pg.Pool({
    connectionString,
    // Maximum number of clients in the pool (default: 10)
    max: 20,
    // How long a client is allowed to remain idle before being closed (default: 10000ms)
    idleTimeoutMillis: 30000,
    // How long to wait when connecting a new client (default: 0, no timeout)
    connectionTimeoutMillis: 5000,
  });

  return drizzle(pool);
}
