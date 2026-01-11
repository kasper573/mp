#!/usr/bin/env tsx
import { createDrizzleClient } from "./src/utils/client";

/**
 * Safe migration script that handles both fresh databases and existing databases.
 * 
 * For fresh databases (CI/Prod deploy):
 * - Simply runs migrations normally
 * 
 * For existing databases without proper migration tracking:
 * - Drops all tables and runs migrations from scratch
 * - This handles the case where local dev databases exist but were created with 'push' instead of 'migrate'
 */

const connectionString = process.env.MP_GAME_SERVICE_DATABASE_CONNECTION_STRING;

if (!connectionString) {
  console.error("❌ Missing MP_GAME_SERVICE_DATABASE_CONNECTION_STRING environment variable");
  process.exit(1);
}

const db = createDrizzleClient(connectionString);

try {
  // Check if drizzle's migration tracking table exists
  const result = await db.$client.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'drizzle' 
      AND table_name = '__drizzle_migrations'
    ) as exists;
  `);

  const hasMigrationTracking = result.rows[0]?.exists === true;

  // Check if there are any user tables
  const tablesResult = await db.$client.query(`
    SELECT EXISTS (
      SELECT FROM pg_tables
      WHERE schemaname NOT IN ('pg_catalog','information_schema','pg_toast')
        AND schemaname NOT LIKE 'pg_temp_%'
    ) as exists;
  `);

  const hasUserTables = tablesResult.rows[0]?.exists === true;

  if (hasUserTables && !hasMigrationTracking) {
    console.log("⚠️  Database exists but migration tracking is missing.");
    console.log("🔄 Dropping all tables to start fresh with migrations...");

    // Drop all user-defined tables
    await db.$client.query(`
      DO $$
      DECLARE
        stmt text;
      BEGIN
        SELECT string_agg(format('DROP TABLE IF EXISTS %I.%I CASCADE;', schemaname, tablename), E'\n')
        INTO stmt
        FROM pg_tables
        WHERE schemaname NOT IN ('pg_catalog','information_schema','pg_toast')
          AND schemaname NOT LIKE 'pg_temp_%';

        IF stmt IS NOT NULL AND stmt <> '' THEN
          EXECUTE stmt;
        END IF;
      END $$;
    `);

    console.log("✅ Database cleared successfully");
  } else if (hasMigrationTracking) {
    console.log("✅ Migration tracking detected, running incremental migrations");
  } else {
    console.log("✅ Fresh database detected, running initial migrations");
  }

  await db.$client.end();
  
  console.log("🚀 Ready to run migrations with drizzle-kit");
  process.exit(0);
} catch (error) {
  console.error("❌ Migration preparation failed:", error);
  await db.$client.end();
  process.exit(1);
}
