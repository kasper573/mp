// oxlint-disable no-await-in-loop
import { createPinoLogger } from "@mp/logger/pino";
import { createShortId, type Tile, type TimesPerSecond } from "@mp/std";
import fs from "fs/promises";
import path from "path";
import { createDbClient } from "./src/client";
import {
  ActorModel,
  Area,
  Character,
  ConsumableDefinition,
  ConsumableInstance,
  EquipmentDefinition,
  EquipmentInstance,
  Npc,
  NpcReward,
  NpcSpawn,
} from "./src/entities";
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
await db.initialize();

const entitiesToTruncate = [
  NpcReward,
  ConsumableDefinition,
  ConsumableInstance,
  EquipmentDefinition,
  EquipmentInstance,
  NpcSpawn,
  Npc,
  Character,
  ActorModel,
  Area,
];

for (const entity of entitiesToTruncate) {
  logger.info(`Truncating table ${entity.name}...`);
  await db.getRepository(entity).clear();
}

logger.info("Inserting areas and actor models...");
await db.transaction(async (manager) => {
  await Promise.all([
    ...areaIds.map((id) => {
      const area = new Area();
      area.id = id;
      return manager.save(area);
    }),
    ...actorModelIds.map((id) => {
      const model = new ActorModel();
      model.id = id;
      return manager.save(model);
    }),
  ]);
});

const oneTile = 1 as Tile;

logger.info("Inserting npcs...");
const soldier = new Npc();
soldier.id = "1" as NpcId; // "1" is currently referenced by some hard coded npc definitions in tiled maps.
soldier.aggroRange = 7 as Tile;
soldier.npcType = "protective";
soldier.attackDamage = 3;
soldier.attackRange = oneTile;
soldier.attackSpeed = 1 as TimesPerSecond;
soldier.speed = oneTile;
soldier.maxHealth = 25;
soldier.modelId = actorModelIds[0];
soldier.name = "Soldier";

const savedSoldier = await db.getRepository(Npc).save(soldier);

await db.transaction(async (manager) => {
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
          const spawn = new NpcSpawn();
          spawn.npcType = npcType;
          spawn.areaId = areaId;
          spawn.count = 10;
          spawn.id = createShortId() as NpcSpawnId;
          spawn.npcId = savedSoldier.id;
          yield manager.save(spawn);
        }
      }
    })(),
  );
});

logger.info("Inserting items definitions...");
const apple = new ConsumableDefinition();
apple.name = "Apple";
apple.maxStackSize = 10;
const savedApple = await db.getRepository(ConsumableDefinition).save(apple);

const sword = new EquipmentDefinition();
sword.name = "Sword";
sword.maxDurability = 100;
const savedSword = await db.getRepository(EquipmentDefinition).save(sword);

logger.info("Inserting npc rewards...");
const reward1 = new NpcReward();
reward1.npcId = savedSoldier.id;
reward1.xp = 10;
await db.getRepository(NpcReward).save(reward1);

const reward2 = new NpcReward();
reward2.npcId = savedSoldier.id;
reward2.consumableItemId = savedApple.id;
reward2.itemAmount = 1;
await db.getRepository(NpcReward).save(reward2);

const reward3 = new NpcReward();
reward3.npcId = savedSoldier.id;
reward3.equipmentItemId = savedSword.id;
reward3.itemAmount = 1;
await db.getRepository(NpcReward).save(reward3);

logger.info("Ending database connection...");
await db.destroy();

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
