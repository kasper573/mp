// oxlint-disable no-await-in-loop
import { createPinoLogger } from "@mp/logger/pino";
import { createShortId, type Tile, type TimesPerSecond } from "@mp/std";
import fs from "fs/promises";
import path from "path";
import { createDbClient } from "./src/client";
import {
  actorModelTable,
  areaTable,
  characterTable,
  itemInstanceTable,
  itemInstanceToContainerTable,
  itemTable,
  npcRewardTable,
  npcSpawnTable,
  npcTable,
} from "./src/schema";
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

logger.info("Deriving area ids from file server files on disk...");
const areaIds = await getAreaIds();

if (!areaIds.length) {
  throw new Error("No area ids found");
}

const db = createDbClient(process.env.MP_API_DATABASE_CONNECTION_STRING ?? "");

const tablesToTruncate = {
  npcRewardTable,
  itemInstanceToContainerTable,
  itemInstanceTable,
  itemTable,
  npcSpawnTable,
  npcTable,
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

const oneTile = 1 as Tile;

logger.info("Inserting npcs...");
const [soldier] = await db
  .insert(npcTable)
  .values({
    id: "1" as NpcId, // "1" is currently referenced by some hard coded npc definitions in tiled maps.
    aggroRange: 7 as Tile,
    npcType: "protective",
    attackDamage: 3,
    attackRange: oneTile,
    attackSpeed: 1 as TimesPerSecond,
    speed: oneTile,
    maxHealth: 25,
    xpReward: 10,
    modelId: actorModelIds[0],
    name: "Soldier",
  })
  .returning({ id: npcTable.id });

await db.transaction(async (tx) => {
  await Promise.all(
    (function* () {
      for (const npcType of npcTypes.values()) {
        if (npcType === "patrol" || npcType === "static") {
          continue;
        }

        for (const areaId of areaIds) {
          logger.info(
            `Inserting npc spawns for ${npcType} in area ${areaId}...`,
          );
          yield tx.insert(npcSpawnTable).values({
            npcType,
            areaId,
            count: 5,
            id: createShortId() as NpcSpawnId,
            npcId: soldier.id,
          });
        }
      }
    })(),
  );
});

logger.info("Inserting items...");
const [apple] = await db
  .insert(itemTable)
  .values({ name: "Apple" })
  .returning({ id: itemTable.id });

logger.info("Inserting npc rewards...");
await db.insert(npcRewardTable).values({
  npcId: soldier.id,
  itemId: apple.id,
});

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
