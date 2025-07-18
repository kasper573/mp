import type {
  AreaLookup,
  AreaResource,
  Npc,
  NpcSpawn,
  NpcSpawnId,
} from "@mp/game";
import { createShortId } from "@mp/std";
import type { TiledClass, VectorTiledObjectUnion } from "@mp/tiled-loader";

export function deriveNpcSpawnsFromAreas(
  areas: AreaLookup,
  availableNpcs: Npc[],
) {
  const derived: Array<{ npc: Npc; spawn: NpcSpawn }> = [];
  for (const area of areas.values()) {
    const npcObjects = area.tiled.getObjectsByClassName("npc" as TiledClass);
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
  npcObject: VectorTiledObjectUnion,
): Omit<NpcSpawn, "npcId" | "id"> {
  switch (npcObject.objectType) {
    case "polyline": {
      const patrol = npcObject.polyline.map((coord) =>
        area.tiled.worldCoordToTile(npcObject.position.add(coord)).round(),
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
        coords: area.tiled.worldCoordToTile(npcObject.position).round(),
        count: 1,
      };
  }
  throw new Error(`Unsupported npc object type: "${npcObject.objectType}"`);
}
