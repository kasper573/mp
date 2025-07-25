import { Vector } from "@mp/math";
import { createShortId } from "@mp/std";
import type { TiledClass, TiledObject } from "@mp/tiled-loader";
import type { Npc, NpcSpawn, NpcSpawnId } from "./types";
import type { AreaLookup } from "../area/lookup";
import type { AreaResource } from "../area/area-resource";

export function deriveNpcSpawnsFromAreas(
  areas: AreaLookup,
  availableNpcs: Npc[],
) {
  const derived: Array<{ npc: Npc; spawn: NpcSpawn }> = [];
  for (const area of areas.values()) {
    const npcObjects = area.tiled.objects.filter(
      (obj) => obj.type === ("npc" as TiledClass),
    );
    for (const npcObject of npcObjects) {
      const idProperty = npcObject.properties.get("npc-id");
      if (!idProperty) {
        throw new Error(
          `NPC object in area "${area.id}" is missing "npc-id" property`,
        );
      }

      const npc = availableNpcs.find((npc) => npc.id === idProperty.value);
      if (!npc) {
        throw new Error(`No NPC by id "${idProperty.value}" available`);
      }

      const spawn: NpcSpawn = {
        npcId: npc.id,
        id: createShortId() as NpcSpawnId,
        ...deriveNpcSpawn(area, npcObject),
      };

      derived.push({ npc, spawn });
    }
  }
  return derived;
}

function deriveNpcSpawn(
  area: AreaResource,
  npcObject: TiledObject,
): Omit<NpcSpawn, "npcId" | "id"> {
  switch (npcObject.objectType) {
    case "polyline": {
      const patrol = npcObject.polyline.map((coord) =>
        area.tiled
          .worldCoordToTile(Vector.from(npcObject).add(Vector.from(coord)))
          .round(),
      );
      return {
        areaId: area.id,
        npcType: "patrol",
        patrol,
        coords: patrol[0],
        count: 1,
      };
    }
    case "point":
      return {
        areaId: area.id,
        npcType: "static",
        coords: area.tiled.worldCoordToTile(Vector.from(npcObject)).round(),
        count: 1,
      };
  }
  throw new Error(`Unsupported npc object type: "${npcObject.objectType}"`);
}
