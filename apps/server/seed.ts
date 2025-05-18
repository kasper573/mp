import { type DbClient } from "@mp/db";
import type { Npc, NpcId, NpcSpawn, NpcSpawnId } from "@mp/game/server";
import {
  npcSpawnTable,
  npcTable,
  type ActorModelLookup,
  type AreaLookup,
  type NpcAggroType,
} from "@mp/game/server";
import type { Tile, TimesPerSecond } from "@mp/std";

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
  areaLookup: AreaLookup,
  actorModelLookup: ActorModelLookup,
) {
  await db.transaction((tx) => {
    return Promise.all(Array.from(generateNpcsAndSpawns()));

    function* generateNpcsAndSpawns() {
      const modelId = Array.from(actorModelLookup.keys())[0];
      const oneTile = 1 as Tile;
      const soldier: Npc = {
        id: "1" as NpcId,
        aggroRange: 7 as Tile,
        aggroType: "protective",
        attackDamage: 1,
        attackRange: oneTile,
        attackSpeed: 1 as TimesPerSecond,
        speed: oneTile,
        maxHealth: 25,
        modelId,
        name: "Soldier",
      };
      yield tx.insert(npcTable).values(soldier).onConflictDoUpdate({
        target: npcTable.id,
        set: soldier,
      });
      for (const areaId of areaLookup.keys()) {
        for (const [i, aggroType] of aggroTypes.entries()) {
          const spawn: NpcSpawn = {
            aggroType: aggroType,
            areaId,
            count: 10,
            id: String(`${areaId}-${i}`) as NpcSpawnId,
            npcId: soldier.id,
            coords: null,
            randomRadius: null,
          };
          yield tx.insert(npcSpawnTable).values(spawn).onConflictDoUpdate({
            target: npcTable.id,
            set: spawn,
          });
        }
      }
    }
  });
}

const aggroTypes: NpcAggroType[] = [
  "aggressive",
  "defensive",
  "pacifist",
  "protective",
];
