import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

export type DBClient = ReturnType<typeof createDBClient>;

export function createDBClient(databaseUrl: string) {
  return drizzle(postgres(databaseUrl));
}
