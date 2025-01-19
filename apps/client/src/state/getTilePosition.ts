import type { AreaResource } from "@mp/data";
import { nodeIdFromVector } from "@mp/data";
import type { Engine } from "@mp/engine";
import { vec_round } from "@mp/math";

export function getTilePosition(area: AreaResource, engine: Engine) {
  const tilePosition = vec_round(
    area.tiled.worldCoordToTile(engine.pointer.worldPosition),
  );
  const isValidTarget = area.graph.hasNode(nodeIdFromVector(tilePosition));
  return { tilePosition, isValidTarget };
}
