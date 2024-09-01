import type { Logger } from "@mp/logger";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

export type DBClient = ReturnType<typeof createDBClient>;

export function createDBClient(databaseUrl: string, logger?: Logger) {
  return drizzle(postgres(databaseUrl), {
    logger: logger ? createDrizzleLogger(logger) : undefined,
  });
}

function createDrizzleLogger(logger: Logger) {
  return { logQuery: logger.info };
}
