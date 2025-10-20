/*
 * ⚠️ THIS FILE NEEDS TO BE MIGRATED TO GEL QUERY BUILDER
 *
 * This drop script is currently non-functional because it uses PostgreSQL
 * specific SQL which has been replaced with Gel (EdgeDB).
 *
 * To complete the migration:
 * 1. Set up Gel database in Docker (see README.md)
 * 2. Use Gel CLI tools for dropping schema:
 *    - `npx gel database wipe` (drops all data)
 *    - Or delete all objects individually with query builder
 *
 * See MIGRATION_GUIDE.md for examples.
 */

import readline from "node:readline/promises";
// import { createDbClient, e } from "./src";  // Uncomment after full migration

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const answer = await rl.question(
  "⚠️  This will permanently drop all data in the database. Continue? (yes/no): ",
);
rl.close();

if (answer.trim().toLowerCase() !== "yes") {
  process.exit(0);
}

process.stderr.write("Drop script needs migration to Gel query builder.\n");
process.stderr.write("Alternative: Use 'npx gel database wipe' command.\n");
process.exit(1);

/* OLD POSTGRESQL CODE - Remove after migration
const db = createDbClient(process.env.MP_API_DATABASE_CONNECTION_STRING ?? "");

await db.$client.query(`...`);
await db.$client.end();
*/
