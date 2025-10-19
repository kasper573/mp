import { createClient, type Client } from "gel";
import type { Logger } from "@mp/logger";

export type DbClient = Client;

export function createDbClient(
  connectionString: string,
  logger?: Logger,
): DbClient {
  const client = createClient({
    dsn: connectionString,
  });

  // If a logger is provided, we could add logging middleware here
  if (logger) {
    // Note: Gel doesn't have built-in query logging like Drizzle
    // You might want to implement custom logging if needed
    logger.info("Gel database client created");
  }

  return client;
}
