import type { VectorLike } from "@mp/math";
import { Vector } from "@mp/math";
import type { VectorGraph } from "@mp/path-finding";
import type { Pixel } from "@mp/std";
import { assert, type Tile } from "@mp/std";
import type { Layer, TiledObject, TiledClass } from "@mp/tiled-loader";
import type { AreaId } from "@mp/fixtures";
import { graphFromTiled } from "./graph-from-tiled";
import { hitTestTiledObject } from "./hit-test-tiled-object";
import type { TiledResource } from "./tiled-resource";

const tiledFixtureStart: TiledClass = "start" as TiledClass;

export class AreaResource {
  readonly start: Vector<Tile>;
  readonly graph: VectorGraph<Tile>;
  readonly dynamicLayer: Layer;
  readonly portals: ReadonlyArray<Portal>;

  constructor(
    readonly id: AreaId,
    readonly tiled: TiledResource,
  ) {
    this.dynamicLayer = assert(
      this.tiled.map.layers.find((l) => l.name === dynamicLayerName),
      `Map must have a '${dynamicLayerName}' layer`,
    );

    this.graph = graphFromTiled(tiled);

    const startObj = assert(
      tiled.objects.find((obj) => obj.type === tiledFixtureStart),
      "Invalid area data: must have a start location",
    );

    const portals: Portal[] = [];
    for (const obj of tiled.objects) {
      const dest = getDestinationFromObject(obj);
      if (dest) {
        portals.push({ destination: dest, object: obj });
      }
    }

    this.portals = portals;
    this.start = tiled.worldCoordToTile(Vector.from(startObj)).round();
  }

  hitTestObjects(coord: VectorLike<Pixel>): TiledObject[] {
    const matches: TiledObject[] = [];
    for (const obj of this.tiled.objects) {
      if (hitTestTiledObject(obj, coord)) {
        matches.push(obj);
      }
    }
    return matches;
  }
}

function getDestinationFromObject(
  object: TiledObject,
): PortalDestination | undefined {
  const prop = object.properties.get("goto");
  if (!prop || prop.type !== "string") {
    return;
  }
  const parts = prop.value.split(",");
  if (parts.length !== 3) {
    return;
  }
  const [areaId, xStr, yStr] = parts;
  const x = Number(xStr);
  const y = Number(yStr);
  if (isNaN(x) || isNaN(y)) {
    return;
  }
  return {
    areaId: areaId as AreaId,
    coords: new Vector(x as Tile, y as Tile),
  };
}

interface Portal {
  readonly destination: PortalDestination;
  readonly object: TiledObject;
}

export interface PortalDestination {
  readonly areaId: AreaId;
  readonly coords: Vector<Tile>;
}

export const dynamicLayerName = "Dynamic";
