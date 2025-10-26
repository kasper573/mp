import type { Pool } from "pg";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

export type DrizzleClient = ReturnType<
  typeof drizzle<Record<string, never>, Pool>
>;

export function createDrizzleClient(connectionString: string): DrizzleClient {
  return drizzle(new pg.Pool({ connectionString }));
}

export function createDbClient(connectionString: string): DbClient {
  return new DbClient(createDrizzleClient(connectionString));
}

/**
 * @internal The class should not be runtime exposed outside the @mp/db package.
 * This ensures that the drizzle client is fully encapsulated.
 */
export class DbClient {
  #drizzle: DrizzleClient;

  constructor(drizzle: DrizzleClient) {
    this.#drizzle = drizzle;
  }

  subscribeToErrors(handler: (error: Error) => unknown) {
    this.#drizzle.$client.on("error", handler);
    return () => this.#drizzle.$client.off("error", handler);
  }

  static unwrap(db: DbClient): DrizzleClient {
    return db.#drizzle;
  }
}
