// oxlint-disable no-await-in-loop
import { createPinoLogger } from "@mp/logger/pino";
import fs from "fs/promises";
import path from "path";
import { createDrizzleClient } from "./src/utils/client";
import {
  actorModelTable,
  areaTable,
  characterTable,
  consumableDefinitionTable,
  equipmentDefinitionTable,
} from "./src/schema";
import type { ActorModelId, AreaId } from "@mp/world";

// This is not a long term plan.
// The proper solution is to provision game data via an external repository
// and have it be a manual administrative task per game server.
// This seed function only exists for convenience while prototyping the game.

const logger = createPinoLogger();

const actorModelIds = ["adventurer"] as ActorModelId[];

logger.info("Deriving area ids from file server files on disk...");
const areaIds = await getAreaIds();

if (!areaIds.length) {
  throw new Error("No area ids found");
}

const db = createDrizzleClient(
  process.env.MP_API_DATABASE_CONNECTION_STRING ?? "",
);

const tablesToTruncate = {
  consumableDefinitionTable,
  equipmentDefinitionTable,
  characterTable,
  actorModelTable,
  areaTable,
};

for (const [tableName, table] of Object.entries(tablesToTruncate)) {
  logger.info(`Truncating table ${tableName}...`);
  await db.delete(table);
}

logger.info("Inserting areas and actor models...");
await db.transaction((tx) =>
  Promise.all([
    ...areaIds.map((id) => tx.insert(areaTable).values({ id })),
    ...actorModelIds.map((id) => tx.insert(actorModelTable).values({ id })),
  ]),
);

logger.info("Inserting items definitions...");
await db
  .insert(consumableDefinitionTable)
  .values({ name: "Apple", maxStackSize: 10 });

await db
  .insert(equipmentDefinitionTable)
  .values({ name: "Sword", maxDurability: 100 });

logger.info("Ending database connection...");
await db.$client.end();

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
