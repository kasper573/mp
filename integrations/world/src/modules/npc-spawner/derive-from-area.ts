import { Vector } from "@mp/math";
import { createShortId } from "@mp/std";
import type { TiledObject } from "@mp/tiled-loader";
import type {
  ActorModelId,
  NpcDefinitionId,
  NpcSpawnId,
  NpcType,
} from "../../domain-ids";
import type { AreaResource } from "../area/area-resource";
import { TiledFixture } from "../area/tiled-fixture";
import type { NpcSpawnDef, NpcTemplate } from "./module";

const defaultTemplate: NpcTemplate = {
  definitionId: "default-npc" as NpcDefinitionId,
  npcType: "static" as NpcType,
  aggroRange: 5,
  movementSpeed: 2,
  maxHealth: 50,
  attackStats: { damage: 5, speed: 1, range: 1 },
  appearance: {
    name: "Goblin",
    modelId: "default" as ActorModelId,
    color: 0x33cc33,
    opacity: 1,
  },
};

export function deriveNpcSpawnsFromArea(
  area: AreaResource,
): NpcSpawnDef[] {
  const result: NpcSpawnDef[] = [];
  for (const obj of area.tiled.objects) {
    if (obj.type !== TiledFixture.npc) continue;
    result.push(buildSpawnDef(area, obj));
  }
  return result;
}

function buildSpawnDef(area: AreaResource, obj: TiledObject): NpcSpawnDef {
  const base = {
    spawnId: createShortId<NpcSpawnId>(),
    areaId: area.id,
    count: 1,
    template: defaultTemplate,
  };

  if (obj.objectType === "polyline") {
    const patrol = obj.polyline.map((coord) =>
      area.tiled
        .worldCoordToTile(Vector.from(obj).add(Vector.from(coord)))
        .round(),
    );
    return {
      ...base,
      template: { ...defaultTemplate, npcType: "patrol" as NpcType },
      position: patrol[0],
      patrol,
    };
  }

  if (obj.objectType === "point") {
    return {
      ...base,
      position: area.tiled.worldCoordToTile(Vector.from(obj)).round(),
    };
  }

  throw new Error(`Unsupported npc object type: "${obj.objectType}"`);
}
