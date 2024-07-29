import { floorVector, type TiledResource, type Vector } from "@mp/excalibur";

export function getStartingPoint(tiled: TiledResource): Vector | undefined {
  const [startObj] = tiled.getObjectsByClassName("start");
  if (!startObj) {
    return;
  }
  return floorVector(tiled.worldCoordToTile(startObj));
}
