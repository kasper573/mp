import type { AreaResource } from "@mp/data";
import { nodeIdFromVector, snapTileVector } from "@mp/data";
import type { Engine } from "@mp/engine";

export function getTilePosition(area: AreaResource, engine: Engine) {
  const tilePosition = snapTileVector(
    area.tiled.worldCoordToTile(engine.pointer.worldPosition),
  );
  const isValidTarget = area.graph.hasNode(nodeIdFromVector(tilePosition));
  return { tilePosition, isValidTarget };
}
