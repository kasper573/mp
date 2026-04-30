import type { NpcDefinitionId, NpcSpawn, NpcSpawnId, NpcType } from "@mp/world";
import { areaIds } from "./areas";

const wanderingTypes: ReadonlyArray<NpcType> = [
  "pacifist",
  "defensive",
  "aggressive",
  "protective",
];

const SPAWNS_PER_TYPE_PER_AREA = 10;
const SOLDIER_ID = "1" as NpcDefinitionId;

export const npcSpawns: ReadonlyArray<NpcSpawn> = areaIds.flatMap((areaId) =>
  wanderingTypes.map<NpcSpawn>((npcType) => ({
    id: `${areaId}:${npcType}` as NpcSpawnId,
    areaId,
    npcId: SOLDIER_ID,
    count: SPAWNS_PER_TYPE_PER_AREA,
    npcType,
  })),
);
