import { createDbClient, eq, npcSpawnTable, npcTable } from "@mp/db-client";
import type {
  ActorModelId,
  AreaId,
  Npc,
  NpcId,
  NpcSpawnId,
} from "@mp/game/server";
import { npcTypes } from "@mp/game/server";
import { createPinoLogger } from "@mp/logger/pino";
import { createShortId, type Tile, type TimesPerSecond } from "@mp/std";
import fs from "fs/promises";
import path from "path";

// This is not a long term plan.
// The proper solution is to provision game data via an external repository
// and have it be a manual administrative task per game server.
// This seed function only exists for convenience while prototyping the game.

const logger = createPinoLogger(true);

logger.info("Looking up area and actor model ids...");
const [areaIds, actorModelIds] = await Promise.all([
  getAreaIds(),
  getActorModelIds(),
]);

const db = createDbClient(process.env.MP_API_DATABASE_CONNECTION_STRING ?? "");

await db.transaction((tx) => {
  return Promise.all(Array.from(generateNpcsAndSpawns()));

  function* generateNpcsAndSpawns() {
    logger.info("Deleting existing npc spawns...");
    for (const areaId of areaIds) {
      yield tx.delete(npcSpawnTable).where(eq(npcSpawnTable.areaId, areaId));
    }
    logger.info("Deleting existing npcs...");
    yield tx.delete(npcTable);

    const oneTile = 1 as Tile;
    const soldier: Npc = {
      id: "1" as NpcId,
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
    };

    logger.info("Inserting npcs...");
    yield tx.insert(npcTable).values(soldier);

    for (const npcType of npcTypes.values()) {
      if (npcType === "patrol" || npcType === "static") {
        continue;
      }

      for (const areaId of areaIds) {
        logger.info(`Inserting npc spawns for ${npcType} in area ${areaId}...`);
        yield tx.insert(npcSpawnTable).values({
          npcType,
          areaId,
          count: 10,
          id: createShortId() as NpcSpawnId,
          npcId: soldier.id,
        });
      }
    }
  }
});

async function getAreaIds(): Promise<AreaId[]> {
  const areaFiles = await fileServerDir("areas");
  return areaFiles
    .filter((entry) => entry.isFile())
    .map(
      (entry) => path.basename(entry.name, path.extname(entry.name)) as AreaId,
    );
}

async function getActorModelIds(): Promise<ActorModelId[]> {
  const areaFiles = await fileServerDir("actors");
  return areaFiles
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name as ActorModelId);
}

function fileServerDir(...parts: string[]) {
  const __dirname = path.dirname(new URL(import.meta.url).pathname);
  return fs.readdir(
    path.resolve(__dirname, "../../docker/file-server/public/", ...parts),
    { withFileTypes: true },
  );
}
