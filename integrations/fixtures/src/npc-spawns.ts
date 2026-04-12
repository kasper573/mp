import type { NpcSpawn, NpcSpawnId, NpcType } from "./types";
import { areas } from "./areas";
import { npcs } from "./npcs";

const spawnNpcTypes: readonly NpcType[] = [
  "pacifist",
  "defensive",
  "aggressive",
  "protective",
];

let spawnCounter = 0;
function nextSpawnId(): NpcSpawnId {
  return `spawn-${++spawnCounter}` as NpcSpawnId;
}

export const npcSpawns: readonly NpcSpawn[] = spawnNpcTypes.flatMap((npcType) =>
  areas.map(
    (area): NpcSpawn => ({
      id: nextSpawnId(),
      areaId: area.id,
      count: 10,
      npcId: npcs[0].id,
      npcType,
    }),
  ),
);
