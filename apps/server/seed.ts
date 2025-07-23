import type { AreaLookup, Npc, NpcId, NpcSpawnId } from "@mp/game/server";
import { npcTypes, type ActorModelLookup } from "@mp/game/server";
import { createShortId, type Tile, type TimesPerSecond } from "@mp/std";
import type { DbClient } from "@mp/db";
import { npcSpawnTable, npcTable } from "@mp/db";

/**
 * This is not a long term plan.
 * The proper solution is to provision game data via an external repository
 * and have it be a manual administrative task per game server.
 *
 * This seed function only exists for convenience while prototyping the game.
 *
 * @deprecated
 */
export async function seed(
  db: DbClient,
  areas: AreaLookup,
  actorModelLookup: ActorModelLookup,
) {
  await db.transaction((tx) => {
    return Promise.all(Array.from(generateNpcsAndSpawns()));

    function* generateNpcsAndSpawns() {
      yield tx.delete(npcSpawnTable);
      yield tx.delete(npcTable);

      const modelId = Array.from(actorModelLookup.keys())[0];
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
        modelId,
        name: "Soldier",
      };

      yield tx.insert(npcTable).values(soldier);

      for (const areaId of areas.keys()) {
        for (const npcType of npcTypes.values()) {
          if (npcType === "patrol" || npcType === "static") {
            continue;
          }

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
}
