import type { TiledResource } from "@mp/excalibur";
import { Coordinate } from "./schema";

export function getStartingPoint(
  tiledMap: TiledResource,
): Coordinate | undefined {
  const [startObj] = tiledMap.getObjectsByClassName("start");
  if (!startObj) {
    return;
  }

  const tileCoord = tiledMap.worldCoordToTile(startObj);
  if (!tileCoord) {
    return;
  }

  return new Coordinate(tileCoord.x, tileCoord.y);
}
