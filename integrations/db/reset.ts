import { stdin as input, stdout as output } from "node:process";
import readline from "node:readline/promises";
import { createDbClient } from "./src";

const rl = readline.createInterface({ input, output });

const answer = await rl.question(
  "⚠️  This will permanently drop all user-defined tables in the database. Continue? (yes/no): ",
);
rl.close();

if (answer.trim().toLowerCase() !== "yes") {
  process.exit(0);
}

const db = createDbClient(process.env.MP_API_DATABASE_CONNECTION_STRING ?? "");

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

db.$client.end();
