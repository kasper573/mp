import type { NpcDefinitionId, NpcSpawn, NpcSpawnId, NpcType } from "@mp/world";
import { areaIds } from "./areas";

const SOLDIER_ID = "1" as NpcDefinitionId;

// Per-type spawn counts. Aggressive NPCs are denser so a player who stops
// moving anywhere on the map will get attacked within reasonable time.
const SPAWNS_PER_TYPE: Record<NpcType, number> = {
  pacifist: 3,
  defensive: 3,
  aggressive: 8,
  protective: 3,
  static: 0,
  patrol: 0,
};

const wanderingTypes: ReadonlyArray<NpcType> = [
  "pacifist",
  "defensive",
  "aggressive",
  "protective",
];

export const npcSpawns: ReadonlyArray<NpcSpawn> = areaIds.flatMap((areaId) =>
  wanderingTypes.map<NpcSpawn>((npcType) => ({
    id: `${areaId}:${npcType}` as NpcSpawnId,
    areaId,
    npcId: SOLDIER_ID,
    count: SPAWNS_PER_TYPE[npcType],
    npcType,
  })),
);
