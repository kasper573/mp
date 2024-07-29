import { floorVector, type TiledResource, type Vector } from "@mp/excalibur";

export function getStartingPoint(tiledMap: TiledResource): Vector | undefined {
  const [startObj] = tiledMap.getObjectsByClassName("start");
  if (!startObj) {
    return;
  }
  return floorVector(tiledMap.worldCoordToTile(startObj));
}
