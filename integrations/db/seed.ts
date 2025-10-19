// oxlint-disable no-await-in-loop

/*
 * ⚠️ THIS FILE NEEDS TO BE MIGRATED TO GEL QUERY BUILDER
 *
 * This seed script is currently non-functional because it uses Drizzle ORM
 * syntax which has been replaced with Gel (EdgeDB).
 *
 * To complete the migration:
 * 1. Set up Gel database in Docker (see README.md)
 * 2. Run `pnpm generate` to create the query builder
 * 3. Replace all db.insert/delete calls with Gel query builder syntax
 *
 * See MIGRATION_GUIDE.md for examples.
 */

import { createPinoLogger } from "@mp/logger/pino";
import { createShortId, type Tile, type TimesPerSecond } from "@mp/std";
import fs from "fs/promises";
import path from "path";
import { createDbClient } from "./src/client";
// import { e } from "./src/schema";  // Uncomment after generating query builder
import {
  npcTypes,
  type ActorModelId,
  type AreaId,
  type NpcId,
  type NpcSpawnId,
} from "./src/types";

// This is not a long term plan.
// The proper solution is to provision game data via an external repository
// and have it be a manual administrative task per game server.
// This seed function only exists for convenience while prototyping the game.

const logger = createPinoLogger(true);

const actorModelIds = ["adventurer"] as ActorModelId[];

// eslint-disable-next-line no-console
console.log("Deriving area ids from file server files on disk...");
const areaIds = await getAreaIds();

if (!areaIds.length) {
  throw new Error("No area ids found");
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const client = createDbClient(
  process.env.MP_API_DATABASE_CONNECTION_STRING ?? "",
);

// TODO: Migrate to Gel query builder
// Example for truncating (deleting all records):
// await e.delete(e.NpcReward).run(client);
// await e.delete(e.ConsumableDefinition).run(client);
// ... etc

logger.warn("Seed script needs migration to Gel query builder. Exiting.");
process.exit(1);

/* OLD DRIZZLE CODE - Remove after migration
for (const [tableName, table] of Object.entries(tablesToTruncate)) {
  logger.info(`Truncating table ${tableName}...`);
  await db.delete(table);
}
*/

/* OLD DRIZZLE CODE - To be migrated to Gel query builder

logger.info("Inserting areas and actor models...");
// Example Gel migration:
// await e.insert(e.Area, { id: areaId }).run(client);
// await e.insert(e.ActorModel, { id: modelId }).run(client);

// const oneTile = 1 as Tile;

logger.info("Inserting npcs...");
// Example Gel migration:
// const soldier = await e.insert(e.Npc, {
//   id: "1" as NpcId,
//   name: "Soldier",
//   aggroRange: 7,
//   npcType: "protective",
//   attackDamage: 3,
//   attackRange: oneTile,
//   attackSpeed: 1 as TimesPerSecond,
//   speed: oneTile,
//   maxHealth: 25,
//   modelId: e.select(e.ActorModel, (m) => ({
//     filter: e.op(m.id, '=', actorModelIds[0])
//   }))
// }).run(client);

logger.info("Inserting items definitions...");
// Example Gel migration:
// const apple = await e.insert(e.ConsumableDefinition, {
//   name: "Apple",
//   maxStackSize: 10
// }).run(client);

logger.info("Ending database connection...");
// Gel clients are typically long-lived, no need to close
// await client.close();
*/

async function getAreaIds(): Promise<AreaId[]> {
  const areaFiles = await fileServerDir("areas");
  return areaFiles
    .filter((entry) => entry.isFile())
    .map(
      (entry) => path.basename(entry.name, path.extname(entry.name)) as AreaId,
    );
}

function fileServerDir(...parts: string[]) {
  const __dirname = path.dirname(new URL(import.meta.url).pathname);
  return fs.readdir(
    path.resolve(__dirname, "../../docker/file-server/public/", ...parts),
    { withFileTypes: true },
  );
}
