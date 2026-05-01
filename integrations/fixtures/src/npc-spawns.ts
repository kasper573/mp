import type { Path, Vector } from "@mp/math";
import type { Tile } from "@mp/std";
import type { AreaId, NpcDefinitionId, NpcSpawnId } from "./ids";
import type { NpcType } from "./npcs";
import { areaIds } from "./areas";

export interface NpcSpawn {
  readonly id: NpcSpawnId;
  readonly count: number;
  readonly npcId: NpcDefinitionId;
  readonly areaId: AreaId;
  readonly coords?: Vector<Tile>;
  readonly randomRadius?: number;
  readonly patrol?: Path<Tile>;
  readonly npcType?: NpcType;
}

const SOLDIER_ID = "1" as NpcDefinitionId;

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
