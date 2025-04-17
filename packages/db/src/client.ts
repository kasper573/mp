import type { Pool } from "pg";
import type { drizzle } from "drizzle-orm/node-postgres";

export type DbClient = ReturnType<typeof drizzle<Record<string, never>, Pool>>;
