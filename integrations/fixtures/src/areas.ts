import { Vector } from "@mp/math";
import type { Tile } from "@mp/std";
import type { AreaId, AreaMeta } from "@mp/world";

export const areas: ReadonlyArray<AreaMeta> = [
  {
    id: "forest" as AreaId,
    displayName: "Forest",
    spawnPoint: new Vector(10 as Tile, 10 as Tile),
  },
  {
    id: "island" as AreaId,
    displayName: "Island",
    spawnPoint: new Vector(10 as Tile, 10 as Tile),
  },
];

export const areaIds: ReadonlyArray<AreaId> = areas.map((a) => a.id);

export const areasById: ReadonlyMap<AreaId, AreaMeta> = new Map(
  areas.map((a) => [a.id, a]),
);
